import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { calculateAttendance, getEffectiveSchedule, type EmploymentType } from '@/lib/engine/calculator';

async function getSessionUser() {
    const cookieStore = await cookies();
    const session = cookieStore.get('session');
    if (!session) return null;
    try { return JSON.parse(session.value); } catch { return null; }
}

// POST /api/attendance/clock-out — 退勤打刻
export async function POST(request: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
        }

        const body = await request.json();
        const { mealCount, dutyType, overtimeReason, overtimeMemo, memo } = body;

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // 出勤レコードを検索
        const existing = await prisma.attendance.findUnique({
            where: { staffId_workDate: { staffId: user.id, workDate: today } },
        });

        if (!existing || existing.status !== 'CLOCKED_IN') {
            return NextResponse.json(
                { error: '本日の出勤記録がありません' },
                { status: 400 }
            );
        }

        // 設定マスタから計算パラメータを取得
        const settingsRows = await prisma.settingMaster.findMany({
            where: { orgId: user.orgId },
        });
        const settingsMap: Record<string, string> = {};
        settingsRows.forEach(s => { settingsMap[s.key] = s.value; });

        const calcSettings = {
            standardWorkHours: parseFloat(settingsMap['standard_work_hours'] || '7.75'),
            breakThresholdHours: parseFloat(settingsMap['break_threshold_hours'] || '6'),
            breakDeductionHours: parseFloat(settingsMap['break_deduction_hours'] || '0.75'),
            overtimeThresholdTime: settingsMap['overtime_threshold_time'] || '17:30',
            overtimeUnitMinutes: parseInt(settingsMap['overtime_unit_minutes'] || '15'),
            shortTimeEnd: settingsMap['short_time_end'] || '16:30',
        };

        // 有効な勤務時間（特別設定含む）を取得
        const effective = await getEffectiveSchedule(user.id, today);

        // 当番設定の反映
        let baseStart = effective?.startTime || undefined;
        let baseEnd = effective?.endTime || undefined;

        if (dutyType && dutyType !== 'NONE') {
            // マスターから当番情報を取得
            const duty = (prisma as any).dutyMaster ? await (prisma as any).dutyMaster.findFirst({
                where: { 
                    orgId: user.orgId, 
                    OR: [
                        { name: dutyType },
                        { name: dutyType === 'EARLY' ? '早出' : (dutyType === 'LATE' ? '遅出' : 'UNKNOWN') }
                    ],
                    isActive: true 
                }
            }) : null;

            if (duty) {
                baseStart = duty.startTime;
                baseEnd = duty.endTime;
            } else if (dutyType === 'EARLY' || dutyType === 'LATE') {
                // 移行前またはフォールバック
                const prefix = dutyType === 'EARLY' ? 'duty_early' : 'duty_late';
                baseStart = settingsMap[`${prefix}_start`] || (dutyType === 'EARLY' ? '07:30' : '10:30');
                baseEnd = settingsMap[`${prefix}_end`] || (dutyType === 'EARLY' ? '16:00' : '19:00');
            }
        }

        // 勤務計算エンジンを実行
        const result = calculateAttendance(
            existing.clockIn!,
            timeStr,
            user.employmentType as EmploymentType,
            calcSettings,
            baseStart,
            baseEnd,
            existing.hourlyLeave || 0
        );

        // 退勤情報で更新
        const attendance = await prisma.attendance.update({
            where: { id: existing.id },
            data: {
                clockOut: timeStr,
                actualWorkHours: result.actualWorkHours,
                breakHours: result.breakHours,
                overtimeHours: result.overtimeHours,
                shortTimeValue: result.shortTimeValue,
                mealCount: mealCount !== undefined ? mealCount : existing.mealCount,
                dutyType: dutyType || 'NONE',
                overtimeReason: overtimeReason || null,
                overtimeMemo: overtimeMemo || null,
                memo: memo || existing.memo,
                isLate: false,
                isEarlyLeave: false,
                status: 'COMPLETED',
            } as any,
        });

        return NextResponse.json({
            success: true,
            attendance,
            calculation: result,
        });
    } catch (error: any) {
        console.error('Clock-out error:', error);
        return NextResponse.json({ error: `退勤打刻に失敗しました: ${error.message || 'サーバーエラー'}` }, { status: 500 });
    }
}
