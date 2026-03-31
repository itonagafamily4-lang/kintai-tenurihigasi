import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { extractLeaveFromMemo } from "@/lib/engine/calculator";

function getClosingPeriod(year: number, month: number, closingDay: number) {
    const endDate = new Date(year, month - 1, closingDay);
    const startDate = new Date(year, month - 2, closingDay + 1);
    return { startDate, endDate };
}

function formatDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") {
            return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const now = new Date();
        const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
        const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));

        const org = await prisma.organization.findFirst({
            where: { id: session.orgId },
        });
        const closingDay = org?.closingDay || 10;

        const { startDate, endDate } = getClosingPeriod(year, month, closingDay);
        const startStr = formatDateStr(startDate);
        const endStr = formatDateStr(endDate);

        // 全職員取得（アクティブのみ）
        const allStaff = await prisma.staff.findMany({
            where: { orgId: session.orgId, isActive: true },
            orderBy: { employeeNo: "asc" },
            select: {
                id: true,
                name: true,
                employeeNo: true,
                employmentType: true,
                standardWorkHours: true,
            },
        });

        const staffIds = allStaff.map(s => s.id);

        // 全勤怠データと全休暇データを並列で取得
        const [allAttendances, allLeaves] = await Promise.all([
            prisma.attendance.findMany({
                where: {
                    staffId: { in: staffIds },
                    workDate: { gte: startStr, lte: endStr },
                },
            }),
            prisma.leaveRequest.findMany({
                where: {
                    staffId: { in: staffIds },
                    leaveDate: { gte: startStr, lte: endStr },
                    status: { in: ["APPROVED", "PENDING"] },
                },
            }),
        ]);

        // 職員ごとに集計
        const summaries = allStaff.map(staff => {
            const att = allAttendances.filter(a => a.staffId === staff.id);
            const lv = allLeaves.filter(l => l.staffId === staff.id);

            const workDays = att.filter(a => a.status === "COMPLETED").length;
            const totalWorkHours = att.reduce((sum, a) => sum + (a.actualWorkHours || 0), 0);
            const totalOvertime = att.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);
            const totalShortTime = att.reduce((sum, a) => sum + (a.shortTimeValue || 0), 0);
            const totalMeals = att.reduce((sum, a) => sum + (a.mealCount || 0), 0);

            // 正式申請ベースのカウント
            const paidLeaveFormal = lv.filter(l => (l.leaveType === "FULL_DAY" || l.leaveType === "HALF_DAY") && l.status === "APPROVED").length;
            const halfDayFormal = lv.filter(l => l.leaveType === "HALF_DAY" && l.status === "APPROVED").length;
            const hourlyLeaveFormal = lv.filter(l => l.leaveType === "HOURLY" && l.status === "APPROVED").reduce((sum, l) => sum + (l.leaveHours || 0), 0);
            const publicHolidays = att.filter(a => a.dayType === "PUBLIC_HOLIDAY").length;
            const sickLeave = lv.filter(l => l.leaveType === "SPECIAL_SICK" && l.status === "APPROVED").length;
            const nursingLeave = lv.filter(l => l.leaveType === "NURSING" && l.status === "APPROVED").length;
            const careLeave = lv.filter(l => l.leaveType === "CARE" && l.status === "APPROVED").length;

            // 備考欄からの追加カウント（正式申請がない日のみ）
            let extraPaidLeave = 0;
            let extraHourlyLeave = 0;
            let extraSpecial = 0;

            att.forEach(a => {
                const hasFormalLeave = lv.some(l => l.leaveDate === a.workDate && l.status === "APPROVED");
                if (!hasFormalLeave && a.memo) {
                    const extracted = extractLeaveFromMemo(a.memo);
                    if (extracted?.type === 'FULL_DAY') {
                        extraPaidLeave += 1;
                    } else if (extracted?.type === 'HALF_DAY') {
                        extraPaidLeave += 0.5;
                    } else if (extracted?.type === 'SPECIAL') {
                        extraSpecial += 1;
                    } else if (extracted?.type === 'HOURLY' && extracted.hours) {
                        extraHourlyLeave += extracted.hours;
                    }
                }
            });

            // 遅刻・早退は備考欄ベース
            const lateCount = att.filter(a => a.memo && a.memo.includes("遅刻")).length;
            const earlyLeaveCount = att.filter(a => a.memo && a.memo.includes("早退")).length;

            return {
                staffId: staff.id,
                name: staff.name,
                employeeNo: staff.employeeNo,
                employmentType: staff.employmentType,
                workDays: workDays || 0,
                totalWorkHours: Math.round((totalWorkHours || 0) * 100) / 100,
                totalOvertime: Math.round((totalOvertime || 0) * 100) / 100,
                totalShortTime: Math.round((totalShortTime || 0) * 10) / 10,
                paidLeave: paidLeaveFormal + extraPaidLeave,
                halfDayLeave: halfDayFormal,
                hourlyLeave: hourlyLeaveFormal + extraHourlyLeave,
                publicHolidays: publicHolidays + extraSpecial,
                sickLeave: sickLeave || 0,
                nursingLeave: nursingLeave || 0,
                careLeave: careLeave || 0,
                totalMeals: totalMeals || 0,
                lateCount: lateCount || 0,
                earlyLeaveCount: earlyLeaveCount || 0,
            };
        });

        return NextResponse.json({
            period: {
                year,
                month,
                closingDay,
                startDate: startStr,
                endDate: endStr,
                label: `${startDate.getMonth() + 1}/${startDate.getDate()}〜${endDate.getMonth() + 1}/${endDate.getDate()}`,
            },
            summaries,
        });
    } catch (error) {
        console.error("Admin attendance summary API error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
