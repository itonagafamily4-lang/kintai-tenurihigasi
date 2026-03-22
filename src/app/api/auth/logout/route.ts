import { NextRequest, NextResponse } from 'next/server';

// POST /api/auth/logout — ログアウト
export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.delete('session');
    return response;
}
