import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { calculateAttendance, DEFAULT_SETTINGS } from '@/lib/engine/calculator';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    if (!sessionCookie) return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    const session = JSON.parse(sessionCookie.value);

    if (session.role !== 'ADMIN') {
        return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { staffIds, clockOutTime, memo } = await req.json();

    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return NextResponse.json({ error: '職員が選択されていません' }, { status: 400 });
    }

    if (!clockOutTime) {
      return NextResponse.json({ error: '退勤時刻が指定されていません' }, { status: 400 });
    }

    const settingsRows = await prisma.settingMaster.findMany({
      where: { orgId: session.orgId },
    });
    const settingsMap: Record<string, string> = {};
    settingsRows.forEach(s => { settingsMap[s.key] = s.value; });

    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

    const results = [];
    
    for (const staffId of staffIds) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId, orgId: session.orgId },
        include: {
          org: true,
          attendances: {
            where: {
              workDate: todayStr,
            },
          },
        },
      });

      if (!staff) {
        results.push({ staffId, name: '不明', status: 'error', message: '職員が見つかりません' });
        continue;
      }

      const attendance = staff.attendances[0];

      if (!attendance) {
        results.push({ staffId, name: staff.name, status: 'skipped', message: '出勤打刻がありません' });
        continue;
      }

      if (attendance.clockOut) {
        results.push({ staffId, name: staff.name, status: 'skipped', message: '既に退勤打刻があります' });
        continue;
      }

      const calcResult = calculateAttendance(
        attendance.clockIn!,
        clockOutTime,
        staff.employmentType as any,
        {
          standardWorkHours: parseFloat(settingsMap['standard_work_hours'] || '7.75'),
          breakThresholdHours: staff.breakThresholdHours ?? parseFloat(settingsMap['break_threshold_hours'] || '6'),
          breakDeductionHours: staff.breakTimeHours ?? parseFloat(settingsMap['break_deduction_hours'] || '0.75'),
          overtimeThresholdTime: settingsMap['overtime_threshold_time'] || '17:30',
          overtimeUnitMinutes: parseInt(settingsMap['overtime_unit_minutes'] || '15'),
          shortTimeEnd: settingsMap['short_time_end'] || '16:30',
        },
        staff.defaultStart || undefined,
        staff.defaultEnd || undefined,
        attendance.hourlyLeave
      );

      await (prisma.attendance as any).update({
        where: { id: attendance.id },
        data: {
          clockOut: clockOutTime,
          actualWorkHours: calcResult.actualWorkHours,
          breakHours: calcResult.breakHours,
          overtimeHours: calcResult.overtimeHours,
          shortTimeValue: calcResult.shortTimeValue,
          memo: memo ? (attendance.memo ? `${attendance.memo} / ${memo}` : memo) : attendance.memo,
          status: 'COMPLETED',
          isLate: false,
          isEarlyLeave: false,
        },
      });

      results.push({ staffId, name: staff.name, status: 'success', message: '退勤完了' });
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      results,
      summary: {
        success: successCount,
        skipped: skippedCount,
        error: errorCount,
      }
    });

  } catch (error: any) {
    console.error('Bulk clock-out API error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました', detail: error.message }, { status: 500 });
  }
}
