
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateAttendance, DEFAULT_SETTINGS } from '@/lib/engine/calculator';

export async function POST(req: Request) {
  try {
    const { staffIds, clockOutTime, memo } = await req.json();

    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return NextResponse.json({ error: '職員が選択されていません' }, { status: 400 });
    }

    if (!clockOutTime) {
      return NextResponse.json({ error: '退勤時刻が指定されていません' }, { status: 400 });
    }

    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

    const results = [];
    
    for (const staffId of staffIds) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
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

      // 勤務計算
      const calcResult = calculateAttendance(
        attendance.clockIn!,
        clockOutTime,
        staff.employmentType as any,
        DEFAULT_SETTINGS,
        staff.defaultStart || undefined,
        staff.defaultEnd || undefined,
        attendance.hourlyLeave
      );

      await (prisma.attendance as any).update({
        where: { id: attendance.id },
        data: {
          clockOut: clockOutTime,
          actualWorkHours: calcResult.actualWorkHours,
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
