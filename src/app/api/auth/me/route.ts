import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// GET /api/auth/me — 現在のログインユーザー情報を取得
export async function GET() {
    try {
        const cookieStore = await cookies();
        const session = cookieStore.get('session');

        if (!session) {
            return NextResponse.json({ user: null }, { status: 401 });
        }

        const user = JSON.parse(session.value);
        return NextResponse.json({ user });
    } catch {
        return NextResponse.json({ user: null }, { status: 401 });
    }
}
