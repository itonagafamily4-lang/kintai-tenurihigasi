import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { getJstDateString, getJstTime, roundAttendanceTime } from '@/lib/date-utils';
import { getEffectiveSchedule } from '@/lib/engine/calculator';

async function getSessionUser() {
    const cookieStore = await cookies();
    const session = cookieStore.get('session');
    if (!session) return null;
    try {
        return JSON.parse(session.value);
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    let currentUser = null;
    const now = new Date();
    const today = getJstDateString();

    try {
        const user = await getSessionUser();
        currentUser = user;
        if (!user) {
            return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
        }

        let timeStr = getJstTime();
        
        // 規定時刻を取得して丸め処理を適用
        const effective = await getEffectiveSchedule(user.id, today);
        if (effective && effective.startTime) {
            timeStr = roundAttendanceTime(timeStr, 'IN', effective.startTime);
        }

        // すでにレコードがある場合（時間有休が先に承認されている場合など）
        const existing = await prisma.attendance.findUnique({
            where: { staffId_workDate: { staffId: user.id, workDate: today } },
        });

        let attendance;
        if (existing) {
            if (existing.status === 'CLOCKED_IN' || existing.status === 'COMPLETED') {
                return NextResponse.json(
                    { error: '本日は既に出勤/退勤済みです', attendance: existing },
                    { status: 400 }
                );
            }
            // 既存レコード（NOT_CLOCKED_IN等）を更新
            attendance = await prisma.attendance.update({
                where: { id: existing.id },
                data: {
                    clockIn: timeStr,
                    status: 'CLOCKED_IN',
                    mealCount: 1,
                },
            });
        } else {
            // 新規作成
            attendance = await prisma.attendance.create({
                data: {
                    staffId: user.id,
                    workDate: today,
                    clockIn: timeStr,
                    status: 'CLOCKED_IN',
                    mealCount: 1,
                },
            });
        }

        return NextResponse.json({ success: true, attendance });
    } catch (error: any) {
        console.error('Clock-in error:', error);
        return NextResponse.json({ 
            error: '出勤打刻に失敗しました (最小構成)', 
            detail: `${error.message} (Date: ${today}, User: ${currentUser?.id})` 
        }, { status: 500 });
    }
}
