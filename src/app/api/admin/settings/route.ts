import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const settings = await prisma.settingMaster.findMany({
            where: { orgId: session.orgId },
        });

        // デフォルト値のフォールバック
        const defaultSettings: Record<string, string> = {
            carryOverLimit: "20",
            timeLeaveLimitDays: "5",
            duty_early_start: "07:30",
            duty_early_end: "16:00",
            duty_late_start: "10:30",
            duty_late_end: "19:00",
        };

        const result = { ...defaultSettings };
        settings.forEach((s) => {
            result[s.key] = s.value;
        });

        return NextResponse.json({ settings: result });
    } catch (error) {
        console.error("Setting GET error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const body = await req.json();

        // 期待するキーリスト
        const keys = [
            "carryOverLimit",
            "timeLeaveLimitDays",
            "duty_early_start",
            "duty_early_end",
            "duty_late_start",
            "duty_late_end"
        ];
        for (const key of keys) {
            if (body[key] !== undefined) {
                const existing = await prisma.settingMaster.findFirst({
                    where: { orgId: session.orgId, key },
                });
                if (existing) {
                    await prisma.settingMaster.update({
                        where: { id: existing.id },
                        data: { value: String(body[key]) },
                    });
                } else {
                    await prisma.settingMaster.create({
                        data: {
                            orgId: session.orgId,
                            key,
                            value: String(body[key]),
                        },
                    });
                }
            }
        }

        return NextResponse.json({ success: true, message: "設定を更新しました" });
    } catch (error) {
        console.error("Setting POST error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
