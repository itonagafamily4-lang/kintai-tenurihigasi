import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getEffectiveSchedule, calculateAttendance, type EmploymentType } from '@/lib/engine/calculator';

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });

        const session = JSON.parse(sessionCookie.value);
        const { date, clockIn, clockOut, reason, mealCount, memo, overtimeReason, overtimeMemo, dutyType } = await req.json();

        if (!date) return NextResponse.json({ error: "日付が必要です" }, { status: 400 });

        const record = await prisma.attendance.findUnique({
            where: {
                staffId_workDate: {
                    staffId: session.id,
                    workDate: date
                }
            },
            include: { staff: { select: { breakTimeHours: true, breakThresholdHours: true } } }
        });

        // 設定マスタから計算パラメータを取得
        const settingsRows = await prisma.settingMaster.findMany({
            where: { orgId: session.orgId },
        });
        const settingsMap: Record<string, string> = {};
        settingsRows.forEach(s => { settingsMap[s.key] = s.value; });

        // 職員ごとの休憩設定を取得
        const staff = await prisma.staff.findUnique({
            where: { id: session.id },
            select: { breakTimeHours: true, breakThresholdHours: true }
        });

        const calcSettings = {
            standardWorkHours: parseFloat(settingsMap['standard_work_hours'] || '7.75'),
            breakThresholdHours: staff?.breakThresholdHours ?? parseFloat(settingsMap['break_threshold_hours'] || '6'),
            breakDeductionHours: staff?.breakTimeHours ?? parseFloat(settingsMap['break_deduction_hours'] || '0.75'),
            overtimeThresholdTime: settingsMap['overtime_threshold_time'] || '17:30',
            overtimeUnitMinutes: parseInt(settingsMap['overtime_unit_minutes'] || '15'),
            shortTimeEnd: settingsMap['short_time_end'] || '16:30',
        };

        // 有効な勤務時間を取得
        const effective = await getEffectiveSchedule(session.id, date);

        let baseStart = effective?.startTime || undefined;
        let baseEnd = effective?.endTime || undefined;

        const finalDutyType = dutyType || (record as any)?.dutyType || 'NONE';

        if (finalDutyType && finalDutyType !== 'NONE') {
            const duty = (prisma as any).dutyMaster ? await (prisma as any).dutyMaster.findFirst({
                where: { 
                    orgId: session.orgId, 
                    OR: [
                        { name: finalDutyType },
                        { name: finalDutyType === 'EARLY' ? '早出' : (finalDutyType === 'LATE' ? '遅出' : 'UNKNOWN') }
                    ],
                    isActive: true 
                }
            }) : null;
            if (duty) {
                baseStart = duty.startTime;
                baseEnd = duty.endTime;
            } else if (finalDutyType === 'EARLY' || finalDutyType === 'LATE') {
                const prefix = finalDutyType === 'EARLY' ? 'duty_early' : 'duty_late';
                baseStart = settingsMap[`${prefix}_start`] || (finalDutyType === 'EARLY' ? '07:30' : '10:30');
                baseEnd = settingsMap[`${prefix}_end`] || (finalDutyType === 'EARLY' ? '16:00' : '19:00');
            }
        }

        let calcResult: any = {
            actualWorkHours: 0,
            breakHours: 0,
            overtimeHours: 0,
            shortTimeValue: 0,
            isLate: false,
            isEarlyLeave: false
        };

        if (clockIn && clockOut) {
            calcResult = calculateAttendance(
                clockIn,
                clockOut,
                session.employmentType as EmploymentType,
                calcSettings,
                baseStart,
                baseEnd,
                record?.hourlyLeave || 0
            );
        }

        const updatedMemo = [memo !== undefined ? memo : record?.memo, reason ? `[修正] ${reason}` : null].filter(Boolean).join(" / ");
        const safeMealCount = (typeof mealCount === 'number' && !isNaN(mealCount)) ? mealCount : (record ? record.mealCount : 0);

        const updateData: any = {
            clockIn,
            clockOut,
            actualWorkHours: calcResult.actualWorkHours,
            breakHours: calcResult.breakHours,
            overtimeHours: calcResult.overtimeHours,
            shortTimeValue: calcResult.shortTimeValue,
            overtimeReason: overtimeReason !== undefined ? overtimeReason : record?.overtimeReason,
            overtimeMemo: overtimeMemo !== undefined ? overtimeMemo : record?.overtimeMemo,
            dutyType: finalDutyType,
            mealCount: safeMealCount,
            isLate: false,
            isEarlyLeave: false,
            status: "MODIFIED",
            memo: updatedMemo || null
        };

        if (record) {
            await prisma.attendance.update({
                where: { id: record.id },
                data: updateData
            });
        } else {
            await prisma.attendance.create({
                data: {
                    staffId: session.id,
                    workDate: date,
                    ...updateData,
                    memo: [memo !== undefined ? memo : null, reason ? `[後から追加] ${reason}` : null].filter(Boolean).join(" / ") || null
                }
            });
        }

        return NextResponse.json({ success: true, message: "打刻を修正しました" });
    } catch (error) {
        console.error("Attendance edit error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
