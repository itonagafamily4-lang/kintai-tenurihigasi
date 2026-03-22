import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/auth/login — ログイン
export async function POST(request: NextRequest) {
    try {
        const { loginId, password } = await request.json();

        if (!loginId || !password) {
            return NextResponse.json(
                { error: 'ログインIDとパスワードを入力してください' },
                { status: 400 }
            );
        }

        const staff = await prisma.staff.findUnique({
            where: { loginId },
            include: { org: true },
        });

        if (!staff || !staff.isActive) {
            return NextResponse.json(
                { error: 'ログインIDまたはパスワードが正しくありません' },
                { status: 401 }
            );
        }

        const isValid = await bcrypt.compare(password, staff.passwordHash);
        if (!isValid) {
            return NextResponse.json(
                { error: 'ログインIDまたはパスワードが正しくありません' },
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

        // セッション情報を返す（簡易版：本番ではJWTトークンを使用）
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
        };

        const response = NextResponse.json({
            success: true,
            user: userData,
            alert: missingClockOut
                ? { type: 'MISSING_CLOCK_OUT', date: yesterdayStr, message: `前日(${yesterdayStr})の退勤が未登録です` }
                : null,
        });

        // クッキーにセッション情報を保存（簡易版）
        response.cookies.set('session', JSON.stringify(userData), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30日間
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'ログインに失敗しました' },
            { status: 500 }
        );
    }
}
