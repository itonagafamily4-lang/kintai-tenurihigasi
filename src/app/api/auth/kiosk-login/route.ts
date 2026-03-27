import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const { staffId } = await request.json();

        if (!staffId) {
            return NextResponse.json(
                { error: '職員を選択してください' },
                { status: 400 }
            );
        }

        const staff = await prisma.staff.findUnique({
            where: { id: staffId },
            include: { org: true },
        });

        if (!staff || !staff.isActive) {
            return NextResponse.json(
                { error: '無効な職員です' },
                { status: 401 }
            );
        }

        // 退勤漏れチェック
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const missingClockOut = await prisma.attendance.findFirst({
            where: {
                staffId: staff.id,
                workDate: yesterdayStr,
                status: 'CLOCKED_IN',
            },
        });

        const userData = {
            id: staff.id,
            employeeNo: staff.employeeNo,
            loginId: staff.loginId,
            name: staff.name,
            email: staff.email,
            employmentType: staff.employmentType,
            role: staff.role,
            orgId: staff.orgId,
            orgName: staff.org.name,
            defaultStart: staff.defaultStart,
            defaultEnd: staff.defaultEnd,
            closingDay: staff.org.closingDay,
            isKiosk: true, // 打刻ログインフラグ
        };

        const response = NextResponse.json({
            success: true,
            user: userData,
            alert: missingClockOut
                ? { type: 'MISSING_CLOCK_OUT', date: yesterdayStr, message: `前日(${yesterdayStr})の退勤が未登録です` }
                : null,
        });

        response.cookies.set('session', JSON.stringify(userData), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30日間
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('Kiosk login error:', error);
        return NextResponse.json(
            { error: 'ログインに失敗しました' },
            { status: 500 }
        );
    }
}
