import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    if (!sessionCookie) return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    const session = JSON.parse(sessionCookie.value);

    if (session.role !== 'ADMIN') {
        return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { staffIds, clockInTime, memo } = await req.json();

    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return NextResponse.json({ error: '職員が選択されていません' }, { status: 400 });
    }

    if (!clockInTime) {
      return NextResponse.json({ error: '出勤時刻が指定されていません' }, { status: 400 });
    }

    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

    const results = [];
    
    for (const staffId of staffIds) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId, orgId: session.orgId },
        include: {
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

      if (attendance && attendance.clockIn) {
        results.push({ staffId, name: staff.name, status: 'skipped', message: '既に出勤打刻があります' });
        continue;
      }

      if (attendance) {
        // すでにレコードがある（欠勤や有休が予定されている場合など）
        await (prisma.attendance as any).update({
          where: { id: attendance.id },
          data: {
            clockIn: clockInTime,
            memo: memo ? (attendance.memo ? `${attendance.memo} / ${memo}` : memo) : attendance.memo,
            status: 'IN_PROGRESS',
          },
        });
      } else {
        // 新規作成
        await (prisma.attendance as any).create({
          data: {
            id: uuidv4(),
            staffId: staff.id,
            orgId: session.orgId,
            workDate: todayStr,
            clockIn: clockInTime,
            memo: memo || '',
            status: 'IN_PROGRESS',
            actualWorkHours: 0,
            breakHours: 0,
            overtimeHours: 0,
            shortTimeValue: 0,
            mealCount: 1, // デフォルトで給食あり（必要なら変更）
            dayType: 'WEEKDAY',
          },
        });
      }

      results.push({ staffId, name: staff.name, status: 'success', message: '出勤完了' });
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
    console.error('Bulk clock-in API error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました', detail: error.message }, { status: 500 });
  }
}
