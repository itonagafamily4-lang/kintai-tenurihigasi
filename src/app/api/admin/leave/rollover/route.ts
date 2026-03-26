import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const body = await req.json();
        const { targetFiscalYear } = body;

        if (!targetFiscalYear) {
            return NextResponse.json({ error: "対象年度を指定してください" }, { status: 400 });
        }

        const prevYear = targetFiscalYear - 1;

        // Carry-over limit from SettingMaster
        const setting = await prisma.settingMaster.findFirst({
            where: { orgId: session.orgId, key: "carryOverLimit" },
        });
        const carryOverLimit = setting ? parseFloat(setting.value) : 20.0;

        const staffs = await prisma.staff.findMany({
            where: { orgId: session.orgId, isActive: true, status: { not: "RETIRED" } },
        });

        let updatedCount = 0;

        for (const staff of staffs) {
            // Get previous year balance
            const prevBalance = await prisma.leaveBalance.findUnique({
                where: { staffId_fiscalYear: { staffId: staff.id, fiscalYear: prevYear } }
            });

            let newCarriedOverDays = 0;

            if (prevBalance) {
                // 消化優先順位: 繰越分から消化 -> 新規付与分から消化
                // なので、今年残った「前年度繰越分」は消滅。（前々年度分が消滅するということ）
                // 繰り越せるのは「今年度の新規付与分のうち、使われなかった分」のみ。
                // 今年度使用した分（usedDays）を、まず carriedOverDays から引き、足りない分を grantedDays から引く。

                const consumedFromCarryOver = Math.min(prevBalance.carriedOverDays, prevBalance.usedDays);
                const consumedFromGranted = Math.max(0, prevBalance.usedDays - prevBalance.carriedOverDays);

                const remainingGranted = Math.max(0, prevBalance.grantedDays - consumedFromGranted);

                // 次年度への繰越日数は上限（20日など）でクリップ
                newCarriedOverDays = Math.min(carryOverLimit, remainingGranted);
            }

            // 新年度の総付与日数の決定処理
            const LEAVE_TABLE_A = [10, 11, 12, 14, 16, 18, 20];
            const LEAVE_TABLE_B: Record<number, number[]> = {
                4: [7, 8, 9, 10, 12, 13, 15],
                3: [5, 6, 6, 8, 9, 10, 11],
                2: [3, 4, 4, 5, 6, 6, 7],
                1: [1, 2, 2, 2, 3, 3, 3]
            };

            const aprilFirstDate = new Date(`${targetFiscalYear}-04-01`);
            let yearsOfService = 0.5; // default
            if (staff.joinDate) {
                // If joinDate only has year-month (YYYY-MM), treat as YYYY-MM-01
                const dateStr = staff.joinDate.length === 7 ? `${staff.joinDate}-01` : staff.joinDate;
                const joinDate = new Date(dateStr);
                const diffMs = aprilFirstDate.getTime() - joinDate.getTime();
                yearsOfService = diffMs / (1000 * 60 * 60 * 24 * 365.25);
            }

            let serviceIndex = 0;
            if (yearsOfService >= 6.5) serviceIndex = 6;
            else if (yearsOfService >= 5.5) serviceIndex = 5;
            else if (yearsOfService >= 4.5) serviceIndex = 4;
            else if (yearsOfService >= 3.5) serviceIndex = 3;
            else if (yearsOfService >= 2.5) serviceIndex = 2;
            else if (yearsOfService >= 1.5) serviceIndex = 1;

            let newGrantedDays = 0;
            const hours = staff.weeklyWorkHours || 40;
            const days = staff.weeklyWorkDays || 5;

            // --- 出勤率の計算（育児休業への法的配慮） ---
            const prevYearStart = new Date(`${prevYear}-04-01`);
            const prevYearEnd = new Date(`${targetFiscalYear}-03-31`);

            // 勤怠実績を取得
            const attendances = await prisma.attendance.findMany({
                where: {
                    staffId: staff.id,
                    workDate: { gte: `${prevYear}-04-01`, lte: `${targetFiscalYear}-03-31` },
                }
            });

            // 実作動日数
            let actualWorkedDays = attendances.filter(a => a.dayType === "WORK" && a.clockIn).length;
            // 育休を「全出勤」とみなす処理
            let childcareLeaveDays = 0;
            if (staff.childcareLeaveStart) {
                const leaveStart = new Date(staff.childcareLeaveStart);
                const leaveEnd = staff.childcareLeaveEnd ? new Date(staff.childcareLeaveEnd) : new Date("2099-12-31");

                // 簡易的に昨年度の育休被り日数を計算
                for (let d = new Date(prevYearStart); d <= prevYearEnd; d.setDate(d.getDate() + 1)) {
                    if (d >= leaveStart && d <= leaveEnd) {
                        // 土日祝判定などを厳密にやるべきだが、ここでは週の所定労働日数から概算するか、
                        // 単純に被っている期間の平日（所定労働日）を出勤とみなす
                        if (d.getDay() !== 0 && d.getDay() !== 6) {
                            childcareLeaveDays++;
                        }
                    }
                }
            }

            // 全労働日数の概算 (52週 × 週の所定労働日数) ※システム本格稼働前は出勤率100%とみなすための配慮も必要
            const expectedWorkDays = days * 52;
            const totalConsideredAsWorked = actualWorkedDays + childcareLeaveDays;

            // データがほとんどない(稼働初年度など)場合は80%以上とみなす（システム導入時の配慮）
            // 厳密には、expectedWorkDaysがゼロより大きく、かつ実績が入っている場合のみブロックする
            let attendanceRate = 1.0;
            if (attendances.length > 30) {
                attendanceRate = totalConsideredAsWorked / expectedWorkDays;
            }

            if (attendanceRate >= 0.8) {
                if (hours >= 30 || days >= 5) {
                    // Group A
                    newGrantedDays = LEAVE_TABLE_A[serviceIndex];
                } else {
                    // Group B
                    const safeDays = Math.max(1, Math.min(4, days));
                    newGrantedDays = LEAVE_TABLE_B[safeDays][serviceIndex];
                }
            } else {
                // 80%未満の場合は付与なし(0日)
                newGrantedDays = 0;
            }

            const totalDays = newGrantedDays + newCarriedOverDays;
            const mandatoryTakeDays = newGrantedDays >= 10 ? 5 : 0;

            // アップサート（すでに存在する場合は更新）
            await prisma.leaveBalance.upsert({
                where: { staffId_fiscalYear: { staffId: staff.id, fiscalYear: targetFiscalYear } },
                update: {
                    carriedOverDays: newCarriedOverDays,
                    totalDays: newGrantedDays + newCarriedOverDays,
                    remainingDays: newGrantedDays + newCarriedOverDays,
                },
                create: {
                    staffId: staff.id,
                    fiscalYear: targetFiscalYear,
                    grantedDays: newGrantedDays,
                    carriedOverDays: newCarriedOverDays,
                    totalDays,
                    usedDays: 0,
                    remainingDays: totalDays,
                }
            });

            updatedCount++;
        }

        return NextResponse.json({ success: true, message: `${updatedCount}名の${targetFiscalYear}年度の有給休暇繰り越し処理を完了しました` });
    } catch (error) {
        console.error("Rollover error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
