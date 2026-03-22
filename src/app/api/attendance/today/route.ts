import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

async function getSessionUser() {
    const cookieStore = await cookies();
    const session = cookieStore.get('session');
    if (!session) return null;
    try { return JSON.parse(session.value); } catch { return null; }
}

import { getEffectiveSchedule } from '@/lib/engine/calculator';

// GET /api/attendance/today — 本日の勤怠情報
export async function GET() {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
        }

        const today = new Date().toISOString().split('T')[0];
        const attendance = await prisma.attendance.findUnique({
            where: { staffId_workDate: { staffId: user.id, workDate: today } },
        });

        const leave = await prisma.leaveRequest.findFirst({
            where: {
                staffId: user.id,
                leaveDate: today,
                status: 'APPROVED',
            }
        });

        const effectiveSchedule = await getEffectiveSchedule(user.id, today);

        const duties = (prisma as any).dutyMaster ? await (prisma as any).dutyMaster.findMany({
            where: { orgId: user.orgId, isActive: true },
            orderBy: { startTime: 'asc' },
        }) : [];

        return NextResponse.json({
            attendance: attendance || null,
            leave: leave || null,
            effectiveSchedule,
            duties
        });
    } catch (error) {
        console.error('Today error:', error);
        return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
    }
}
