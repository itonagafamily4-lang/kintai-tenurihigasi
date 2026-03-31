import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getFiscalYear, extractLeaveFromMemo } from "@/lib/engine/calculator";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);

        // 現在の年度を計算（4月始まり）
        const fiscalYear = getFiscalYear(new Date());

        // 有休残高を取得
        let balance = await prisma.leaveBalance.findUnique({
            where: {
                staffId_fiscalYear: {
                    staffId: session.id,
                    fiscalYear,
                },
            },
            include: {
                staff: {
                    select: { standardWorkHours: true }
                }
            }
        });

        // 残高がない場合はデフォルト値を作成
        if (!balance) {
            balance = await prisma.leaveBalance.create({
                data: {
                    staffId: session.id,
                    fiscalYear,
                    totalDays: 10, // デフォルトの有休日数
                    usedDays: 0,
                    remainingDays: 10,
                },
                include: {
                    staff: {
                        select: { standardWorkHours: true }
                    }
                }
            });
        }

        // 今年度の使用状況の内訳を取得
        const startDate = `${fiscalYear}-04-01`;
        const endDate = `${fiscalYear + 1}-03-31`;

        const leaveRequests = await prisma.leaveRequest.findMany({
            where: {
                staffId: session.id,
                leaveDate: {
                    gte: startDate,
                    lte: endDate,
                },
                status: { in: ["APPROVED", "PENDING"] },
            },
            orderBy: { leaveDate: "desc" },
        });

        const breakdown = {
            fullDay: leaveRequests.filter((l) => l.leaveType === "FULL_DAY" && l.status === "APPROVED").length,
            halfDay: leaveRequests.filter((l) => l.leaveType === "HALF_DAY" && l.status === "APPROVED").length,
            hourly: leaveRequests.filter((l) => l.leaveType === "HOURLY" && l.status === "APPROVED")
                .reduce((sum, l) => sum + (l.leaveHours || 0), 0),
            sickLeave: leaveRequests.filter((l) => l.leaveType === "SPECIAL_SICK" && l.status === "APPROVED").length,
            nursingLeave: leaveRequests.filter((l) => l.leaveType === "NURSING" && l.status === "APPROVED").length,
            careLeave: leaveRequests.filter((l) => l.leaveType === "CARE" && l.status === "APPROVED").length,
            pending: leaveRequests.filter((l) => l.status === "PENDING").length,
        };

        // 備考欄からの休暇情報を動的に加算（正式申請が優先）
        const attendances = await prisma.attendance.findMany({
            where: {
                staffId: session.id,
                workDate: { gte: startDate, lte: endDate },
            }
        });

        const hourUnit = Math.ceil(balance.staff?.standardWorkHours || 8.0);
        let extraPaidLeave = 0;
        let extraPublicHolidays = 0;
        let extraHourlyLeave = 0;

        attendances.forEach(a => {
            const dateStr = a.workDate;
            const hasFormalLeave = leaveRequests.some(l => l.leaveDate === dateStr && l.status === "APPROVED");
            
            if (!hasFormalLeave && a.memo) {
                const extracted = extractLeaveFromMemo(a.memo);
                if (extracted?.type === 'FULL_DAY') {
                    extraPaidLeave += 1;
                } else if (extracted?.type === 'SPECIAL') {
                    extraPublicHolidays += 1;
                } else if (extracted?.type === 'HOURLY' && extracted.hours) {
                    extraHourlyLeave += extracted.hours;
                }
            }
        });

        breakdown.fullDay += extraPaidLeave;
        breakdown.hourly += extraHourlyLeave;

        // 残高から動的に差し引く
        let adjustedRemaining = balance.remainingDays - extraPaidLeave - (extraHourlyLeave / hourUnit);
        let adjustedTimeUsed = balance.timeLeaveUsedHours + extraHourlyLeave;
        let adjustedUsed = balance.usedDays + extraPaidLeave + (extraHourlyLeave / hourUnit);

        const returnBalance = {
            ...balance,
            remainingDays: adjustedRemaining,
            timeLeaveUsedHours: adjustedTimeUsed,
            usedDays: adjustedUsed
        };

        // 特別休暇の残高を取得
        const specialBalances = await prisma.specialLeaveBalance.findMany({
            where: {
                staffId: session.id,
                fiscalYear,
            }
        });

        return NextResponse.json({
            balance: returnBalance,
            breakdown,
            specialBalances,
            fiscalYear,
        });
    } catch (error) {
        console.error("Leave balance API error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
