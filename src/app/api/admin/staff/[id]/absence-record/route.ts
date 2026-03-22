import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const resolvedParams = await params;
        const staffId = resolvedParams.id;

        const records = await prisma.leaveOfAbsenceRecord.findMany({
            where: { staffId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ records });
    } catch (error) {
        console.error("Absence record fetch error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const resolvedParams = await params;
        const staffId = resolvedParams.id;
        const body = await req.json();

        const newRecord = await prisma.leaveOfAbsenceRecord.create({
            data: {
                staffId,
                maternityLeaveStart: body.maternityLeaveStart || null,
                maternityLeaveEnd: body.maternityLeaveEnd || null,
                childcareLeaveStart: body.childcareLeaveStart || null,
                expectedReturnDate: body.expectedReturnDate || null,
                actualReturnDate: body.actualReturnDate || null,
                memo: body.memo || null,
            },
        });

        return NextResponse.json({ success: true, record: newRecord });
    } catch (error) {
        console.error("Absence record create error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
