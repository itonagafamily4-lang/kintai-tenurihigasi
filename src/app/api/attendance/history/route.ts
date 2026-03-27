import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getEffectiveSchedule } from "@/lib/engine/calculator";

// 締め日に基づいた期間を計算
function getClosingPeriod(year: number, month: number, closingDay: number) {
    // month月分: 前月(closingDay+1日) 〜 当月(closingDay日)
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
        const { searchParams } = new URL(req.url);

        // クエリパラメータから年月を取得（デフォルトは今月）
        const now = new Date();
        const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
        const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
        const mode = searchParams.get("mode");
        // 管理者は他の職員の履歴も見れる
        const targetStaffId = searchParams.get("staffId") || session.id;

        // 権限チェック: 管理者以外は自分の履歴のみ
        if (targetStaffId !== session.id && session.role !== "ADMIN") {
            return NextResponse.json({ error: "権限がありません" }, { status: 403 });
        }

        // 組織の締め日を取得
        const org = await prisma.organization.findFirst({
            where: { id: session.orgId },
        });
        const closingDay = org?.closingDay || 10;

        // 期間計算
        let startDate: Date, endDate: Date;
        if (mode === "calendar") {
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0);
        } else {
            const period = getClosingPeriod(year, month, closingDay);
            startDate = period.startDate;
            endDate = period.endDate;
        }
        const startStr = formatDateStr(startDate);
        const endStr = formatDateStr(endDate);

        // ✅ 複数のFirestoreクエリを並行実行（直列→並行で2〜4倍高速化）
        const [attendances, leaveRequests, staff, settingsRows, dutyRows, allSchedules] = await Promise.all([
            // 勤怠データ取得
            prisma.attendance.findMany({
                where: {
                    staffId: targetStaffId,
                    workDate: { gte: startStr, lte: endStr },
                },
                orderBy: { workDate: "asc" },
            }),
            // 休暇データ取得
            prisma.leaveRequest.findMany({
                where: {
                    staffId: targetStaffId,
                    leaveDate: { gte: startStr, lte: endStr },
                    status: "APPROVED",
                },
            }),
            // 対象職員の情報
            prisma.staff.findUnique({
                where: { id: targetStaffId },
                select: { id: true, name: true, employeeNo: true, employmentType: true, assignedClass: true, orgId: true, defaultStart: true, defaultEnd: true } as any,
            }),
            // 設定マスタ
            prisma.settingMaster.findMany({
                where: { orgId: session.orgId },
            }),
            // 当番マスター
            (prisma as any).dutyMaster ? (prisma as any).dutyMaster.findMany({
                where: { orgId: session.orgId },
            }) : Promise.resolve([]),
            // スケジュール特別設定
            prisma.schedule.findMany({
                where: {
                    orgId: session.orgId,
                    date: { gte: startStr, lte: endStr },
                } as any
            }),
        ]);

        if (!staff) {
            return NextResponse.json({ error: "職員が見つかりません" }, { status: 404 });
        }

        const settingsMap: Record<string, string> = {};
        settingsRows.forEach((s: any) => { settingsMap[s.key] = s.value; });

        const allOverrides = allSchedules.filter((s: any) => s.isWorkOverride === true);

        // 期間内の全日付を生成
        const days: any[] = [];
        const current = new Date(startDate);
        while (current <= endDate) {
            const dateStr = formatDateStr(current);
            const att = attendances.find((a) => a.workDate === dateStr) || null;
            const lv = leaveRequests.find((l) => l.leaveDate === dateStr) || null;
            
            // 特別設定の特定
            const dayOverrides = allOverrides.filter(o => o.date === dateStr);
            let bestOverride = dayOverrides.find(o => (o as any).targetType === 'CLASS' && (o as any).targetValue === (staff as any).assignedClass);
            if (!bestOverride) bestOverride = dayOverrides.find(o => (o as any).targetType === (staff as any).employmentType);
            if (!bestOverride) bestOverride = dayOverrides.find(o => (o as any).targetType === 'ALL');

            const effectiveSchedule = bestOverride ? {
                startTime: bestOverride.startTime,
                endTime: bestOverride.endTime,
                isOverride: true,
                title: bestOverride.title,
            } : {
                startTime: staff.defaultStart,
                endTime: staff.defaultEnd,
                isOverride: false,
                title: null,
            };

            // 遅刻・早退の動的判定
            let enrichedAtt = att ? { ...(att as any) } : null;
            if (enrichedAtt && enrichedAtt.clockIn) {
                const timeToMin = (t: string) => {
                    const [h, m] = (t || "00:00").split(':').map(Number);
                    return h * 60 + m;
                };

                // 当番によるベース時間の決定
                let baseStart = (effectiveSchedule as any).startTime || "08:30";
                let baseEnd = (effectiveSchedule as any).endTime || "17:30";

                const dt = enrichedAtt.dutyType;
                if (dt && dt !== 'NONE') {
                    const duty = dutyRows.find((d: any) => 
                        d.name === dt || 
                        d.name === (dt === 'EARLY' ? '早出' : (dt === 'LATE' ? '遅出' : 'UNKNOWN'))
                    );
                    if (duty) {
                        baseStart = duty.startTime;
                        baseEnd = duty.endTime;
                    } else if (dt === 'EARLY' || dt === 'LATE') {
                        const prefix = dt === 'EARLY' ? 'duty_early' : 'duty_late';
                        baseStart = settingsMap[`${prefix}_start`] || (dt === 'EARLY' ? '07:30' : '10:30');
                        baseEnd = settingsMap[`${prefix}_end`] || (dt === 'EARLY' ? '16:00' : '19:00');
                    }
                }

                // 遅刻・早退判定 (自動判定機能は廃止され、備考欄ベースの手動運用へ移行)
                enrichedAtt.isLate = false;
                enrichedAtt.isEarlyLeave = false;
            }

            days.push({
                date: dateStr,
                dayOfWeek: current.getDay(),
                attendance: enrichedAtt,
                leave: lv,
                effectiveSchedule: effectiveSchedule.isOverride ? effectiveSchedule : null,
            });
            current.setDate(current.getDate() + 1);
        }

        // 集計
        const summary = {
            workDays: attendances.filter((a) => a.status === "COMPLETED").length,
            totalWorkHours: attendances.reduce((sum, a) => sum + ((a as any).actualWorkHours || 0), 0),
            totalOvertime: attendances.reduce((sum, a) => sum + ((a as any).overtimeHours || 0), 0),
            totalShortTime: attendances.reduce((sum, a) => sum + ((a as any).shortTimeValue || 0), 0),
            publicHolidays: attendances.filter((a) => a.dayType === "PUBLIC_HOLIDAY").length,
            paidLeave: leaveRequests.filter((l) => l.leaveType === "FULL_DAY" || l.leaveType === "HALF_DAY").length,
            sickLeave: leaveRequests.filter((l) => l.leaveType === "SPECIAL_SICK").length,
            totalHourlyLeave: leaveRequests.filter(l => l.leaveType === "HOURLY").reduce((sum, l) => sum + (l.leaveHours || 0), 0),
            totalMeals: attendances.reduce((sum, a) => sum + ((a as any).mealCount || 0), 0),
            lateCount: attendances.filter(a => a.memo && a.memo.includes("遅刻")).length,
            earlyLeaveCount: attendances.filter(a => a.memo && a.memo.includes("早退")).length,
        };

        return NextResponse.json({
            period: {
                year,
                month,
                closingDay,
                startDate: startStr,
                endDate: endStr,
                label: `${startDate.getMonth() + 1}/${startDate.getDate()}〜${endDate.getMonth() + 1}/${endDate.getDate()}`,
            },
            staff,
            days,
            summary,
        });
    } catch (error: any) {
        console.error("History API error:", error);
        // デバッグ用
        try {
            const fs = require('fs');
            fs.appendFileSync('./.api_error.log', `${new Date().toISOString()} [History API] ${error.stack || error}\n`);
        } catch (e) {}
        
        return NextResponse.json({ error: `サーバーエラー: ${error.message || error}` }, { status: 500 });
    }
}
