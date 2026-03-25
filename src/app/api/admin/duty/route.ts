import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);

        if (!(prisma as any).dutyMaster) {
            return NextResponse.json({ duties: [] });
        }

        // 全ての有効な当番を取得
        const duties = await (prisma as any).dutyMaster.findMany({
            where: { orgId: session.orgId, isActive: true },
            orderBy: { startTime: "asc" },
        });

        // 初回利用時などで全く当番がない場合のみ、デフォルト（早出・遅出）を作成
        if (duties.length === 0) {
            const allExisting = await (prisma as any).dutyMaster.findMany({
                where: { orgId: session.orgId }
            });
            // 過去に一度も作成されたことがない場合のみ実行
            if (allExisting.length === 0) {
                const defaults = [
                    { orgId: session.orgId, name: "早出", startTime: "07:30", endTime: "16:00", isActive: true },
                    { orgId: session.orgId, name: "遅出", startTime: "10:30", endTime: "19:00", isActive: true },
                ];
                for (const d of defaults) {
                    await (prisma as any).dutyMaster.create({ data: d });
                }
                const newDuties = await (prisma as any).dutyMaster.findMany({
                    where: { orgId: session.orgId, isActive: true },
                    orderBy: { startTime: "asc" },
                });
                return NextResponse.json({ duties: newDuties });
            }
        }

        return NextResponse.json({ duties });
    } catch (error: any) {
        console.error("Duty GET error:", error);
        return NextResponse.json({ 
            error: "サーバーエラー", 
            detail: error.message 
        }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const { id, name, startTime, endTime, action } = await req.json();

        if (action === "DELETE") {
            if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
            await (prisma as any).dutyMaster.update({
                where: { id },
                data: { isActive: false },
            });
            return NextResponse.json({ success: true });
        }

        if (!name || !startTime || !endTime) {
            return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
        }

        if (id) {
            // 更新
            await (prisma as any).dutyMaster.update({
                where: { id },
                data: { name, startTime, endTime },
            });
        } else {
            // 新規作成
            await (prisma as any).dutyMaster.create({
                data: {
                    orgId: session.orgId,
                    name,
                    startTime,
                    endTime,
                },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Duty POST error:", error);
        return NextResponse.json({ 
            error: "サーバーエラー", 
            detail: error.message 
        }, { status: 500 });
    }
}
