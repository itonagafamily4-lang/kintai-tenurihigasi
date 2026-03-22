import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const sessionCookie = req.cookies.get("session");
  const { pathname } = req.nextUrl;

  // セッションがない場合
  if (!sessionCookie) {
    // APIのリクエストで未認証の場合は401
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }
    // それ以外の画面アクセスはログイン画面へ（本来はリダイレクトだが今の構成に合わせる）
    return NextResponse.next();
  }

  try {
    const user = JSON.parse(sessionCookie.value);

    // 管理者のみがアクセスできるAPI/パスのガード
    if (pathname.startsWith("/api/admin") || pathname.includes("/admin")) {
      if (user.role !== "ADMIN") {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }
  } catch (e) {
    // パース失敗などは未認証扱い
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/admin/:path*",
    // 必要に応じて追加
  ],
};
