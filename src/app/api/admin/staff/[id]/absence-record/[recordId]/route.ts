import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string, recordId: string }> }) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const resolvedParams = await params;
        const { id, recordId } = resolvedParams;

        await prisma.leaveOfAbsenceRecord.delete({
            where: { id: recordId, staffId: id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Absence record delete error:", error);
        return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }
}
