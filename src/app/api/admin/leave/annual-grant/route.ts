import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

async function getSessionUser() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) return null;
    try {
        return JSON.parse(sessionCookie.value);
    } catch {
        return null;
    }
}

function calculateTenureMonths(joinDate: string, targetYear: number): number {
    const targetDate = new Date(`${targetYear}-04-01T00:00:00Z`);
    // joinDate can be YYYY-MM
    let joinDateStr = joinDate;
    if (joinDate.length === 7) joinDateStr += "-01";
    const joinDateObj = new Date(`${joinDateStr}T00:00:00Z`);
    
    if (isNaN(joinDateObj.getTime())) return 0;
    
    // Difference in months
    const months = (targetDate.getFullYear() - joinDateObj.getFullYear()) * 12 + (targetDate.getMonth() - joinDateObj.getMonth());
    return months;
}

function getStandardGrant(months: number): number {
    if (months < 6) return 0;
    if (months < 18) return 10;
    if (months < 30) return 11;
    if (months < 42) return 12;
    if (months < 54) return 14;
    if (months < 66) return 16;
    if (months < 78) return 18;
    return 20;
}

function getProRataGrant(months: number, weeklyDays: number): number {
    if (months < 6) return 0;
    
    // Fallbacks or upper limits
    if (weeklyDays >= 5) return getStandardGrant(months);

    // 4 days/week
    if (weeklyDays === 4) {
        if (months < 18) return 7;
        if (months < 30) return 8;
        if (months < 42) return 9;
        if (months < 54) return 10;
        if (months < 66) return 12;
        if (months < 78) return 13;
        return 15;
    }
    // 3 days/week
    if (weeklyDays === 3) {
        if (months < 18) return 5;
        if (months < 30) return 6;
        if (months < 42) return 6;
        if (months < 54) return 8;
        if (months < 66) return 9;
        if (months < 78) return 10;
        return 11;
    }
    // 2 days/week
    if (weeklyDays === 2) {
        if (months < 18) return 3;
        if (months < 30) return 4;
        if (months < 42) return 4;
        if (months < 54) return 5;
        if (months < 66) return 6;
        if (months < 78) return 6;
        return 7;
    }
    // 1 day/week
    if (weeklyDays === 1) {
        if (months < 18) return 1;
        if (months < 30) return 2;
        if (months < 42) return 2;
        if (months < 54) return 2;
        if (months < 66) return 3;
        if (months < 78) return 3;
        return 3;
    }
    return 0; // Default if 0 days
}

export async function POST(req: Request) {
    try {
        const session = await getSessionUser();
        if (!session || session.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await req.json();
        const { action, targetYear } = body;
        
        if (!targetYear) {
            return NextResponse.json({ error: "実行年度(targetYear)が指定されていません" }, { status: 400 });
        }

        // Fetch all active staff
        const staffList = await prisma.staff.findMany({
            where: { orgId: session.orgId, isActive: true, status: { not: "RETIRED" } },
            include: {
                leaveBalances: true,
            }
        });

        const previewData = [];

        // Preview Phase
        for (const staff of staffList) {
            let grantedDays = 0;
            let carriedOverDays = 0;
            let grantTypeLabel = "対象外";

            if (staff.joinDate) {
                const tenureMonths = calculateTenureMonths(staff.joinDate, targetYear);
                
                // Determine category: Standard vs Pro-rata
                // Standard: weeklyWorkHours >= 30 OR weeklyWorkDays >= 5
                const isStandard = staff.weeklyWorkHours >= 30 || staff.weeklyWorkDays >= 5;
                if (isStandard) {
                    grantedDays = getStandardGrant(tenureMonths);
                    grantTypeLabel = "通常付与";
                } else {
                    grantedDays = getProRataGrant(tenureMonths, staff.weeklyWorkDays);
                    grantTypeLabel = `比例付与 (週${staff.weeklyWorkDays}日)`;
                }

                // If they don't get anything (e.g. less than 6 months tenure)
                if (grantedDays === 0) {
                    grantTypeLabel = "付与なし(勤続6ヶ月未満)";
                }
            } else {
                grantTypeLabel = "入社日未設定";
            }

            // Calculate carried over from previous year (targetYear - 1)
            const prevBalance = staff.leaveBalances.find((b: any) => b.fiscalYear === targetYear - 1);
            let carriedOverHours = 0;
            if (prevBalance && prevBalance.remainingDays > 0) {
                // 【重要】時効（2年）のため、繰り越せるのは前年の「新規付与分」が上限
                carriedOverDays = Math.min(prevBalance.remainingDays, prevBalance.grantedDays);
            }
            // 前年度の時間有休残を繰り越し
            if (prevBalance) {
                const stdHours = staff.standardWorkHours || 8;
                const hourlyUnit = Math.ceil(stdHours);
                const hourlyLimit = hourlyUnit * 5;
                const prevTimeUsed = prevBalance.timeLeaveUsedHours || 0;
                const prevCarriedOverHours = prevBalance.carriedOverHours || 0;
                // 前年度の時間有休残り = (上限 - 使用済) + 前年繰越時間
                const remainingHourlyLeave = Math.max(0, hourlyLimit - prevTimeUsed) + prevCarriedOverHours;
                // 繰越時間は 0～7 に収める（8時間以上は日数に繰り上げ）
                if (remainingHourlyLeave >= 8) {
                    const extraDays = Math.floor(remainingHourlyLeave / 8);
                    carriedOverDays += extraDays;
                    carriedOverHours = remainingHourlyLeave % 8;
                } else {
                    carriedOverHours = remainingHourlyLeave;
                }
            }

            // 現在の年度に既に付与実績がある場合、使用済み日数を引き継ぐ
            const currentBalance = staff.leaveBalances.find((b: any) => b.fiscalYear === targetYear);
            const currentUsedDays = currentBalance ? currentBalance.usedDays : 0;
            const currentTimeLeaveUsedHours = currentBalance ? currentBalance.timeLeaveUsedHours : 0;

            previewData.push({
                staffId: staff.id,
                name: staff.name,
                employeeNo: staff.employeeNo,
                employmentType: staff.employmentType,
                joinDate: staff.joinDate,
                grantTypeLabel,
                grantedDays,
                carriedOverDays,
                carriedOverHours,
                totalDays: grantedDays + carriedOverDays,
                currentUsedDays,
                currentTimeLeaveUsedHours
            });
        }

        // Sort by employeeNo
        previewData.sort((a, b) => a.employeeNo.localeCompare(b.employeeNo));

        if (action === "preview") {
            return NextResponse.json({
                success: true,
                previewData
            });
        }

        if (action === "execute") {
            // Execute the grant
            let totalStaffUpdated = 0;
            let totalDaysGranted = 0;

            for (const item of previewData) {
                if (item.grantedDays > 0 || item.carriedOverDays > 0) {
                    const totalDays = item.grantedDays + item.carriedOverDays;
                    const remainingDaysForCreate = totalDays;
                    const remainingDaysForUpdate = Math.max(0, totalDays - item.currentUsedDays);
                    const mandatoryTakeDays = item.grantedDays >= 10 ? 5 : 0;

                    // Update or create LeaveBalance for targetYear
                    await prisma.leaveBalance.upsert({
                        where: {
                            staffId_fiscalYear: {
                                staffId: item.staffId,
                                fiscalYear: targetYear,
                            }
                        },
                        create: {
                            staffId: item.staffId,
                            fiscalYear: targetYear,
                            grantedDays: item.grantedDays,
                            carriedOverDays: item.carriedOverDays,
                            carriedOverHours: item.carriedOverHours || 0,
                            totalDays: totalDays,
                            remainingDays: remainingDaysForCreate,
                            usedDays: 0,
                            timeLeaveUsedHours: 0,
                            mandatoryTakeDays: mandatoryTakeDays
                        },
                        update: {
                            grantedDays: item.grantedDays,
                            carriedOverDays: item.carriedOverDays,
                            carriedOverHours: item.carriedOverHours || 0,
                            totalDays: totalDays,
                            remainingDays: remainingDaysForUpdate,
                            mandatoryTakeDays: mandatoryTakeDays
                            // usedDays と timeLeaveUsedHours は既存の利用実績を保持するためリセットしない
                        }
                    });

                    // Set remainingDays to 0 for balances from 2 years ago or older as they expire
                    await prisma.leaveBalance.updateMany({
                        where: {
                            staffId: item.staffId,
                            fiscalYear: { lte: targetYear - 2 },
                            remainingDays: { gt: 0 }
                        },
                        data: {
                            remainingDays: 0
                        }
                    });

                    // Insert LeaveRequest as history log
                    await prisma.leaveRequest.create({
                        data: {
                            staffId: item.staffId,
                            leaveDate: `${targetYear}-04-01`,
                            leaveType: "SYSTEM_GRANT",
                            status: "APPROVED",
                            reason: `${targetYear}年度 4/1 一斉付与 (新規: ${item.grantedDays}日, 繰越: ${item.carriedOverDays}日)`
                        }
                    });

                    totalStaffUpdated++;
                    totalDaysGranted += item.grantedDays;
                }
            }

            return NextResponse.json({
                success: true,
                message: `年次有休付与処理が完了しました。対象者${totalStaffUpdated}名に合計${totalDaysGranted}日の有休を付与しました。`
            });
        }

        return NextResponse.json({ error: "不正なアクションです" }, { status: 400 });

    } catch (error) {
        console.error("Annual leave grant error:", error);
        return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
    }
}
