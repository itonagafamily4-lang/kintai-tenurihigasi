import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
    const session = JSON.parse(sessionCookie.value);

    const specialLeaves = await prisma.specialLeaveMaster.findMany({
        where: { orgId: session.orgId, isActive: true },
        orderBy: { createdAt: "asc" }
    });
    return NextResponse.json({ specialLeaves });
}

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
    const session = JSON.parse(sessionCookie.value);

    if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

    const body = await req.json();
    const { name, defaultDays, isPaid } = body;

    const exist = await prisma.specialLeaveMaster.findFirst({
        where: { orgId: session.orgId, name }
    });

    if (exist) {
        return NextResponse.json({ error: "既に同名の特休が存在します" }, { status: 400 });
    }

    const newLeave = await prisma.specialLeaveMaster.create({
        data: {
            orgId: session.orgId,
            name,
            defaultDays: defaultDays ? parseInt(defaultDays) : null,
            isPaid: !!isPaid
        }
    });

    return NextResponse.json({ success: true, specialLeave: newLeave });
}

export async function DELETE(req: NextRequest) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
    const session = JSON.parse(sessionCookie.value);

    if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが指定されていません" }, { status: 400 });

    try {
        await prisma.specialLeaveMaster.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "削除できませんでした" }, { status: 500 });
    }
}
