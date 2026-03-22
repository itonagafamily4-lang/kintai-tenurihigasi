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

        const now = new Date();
        const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

        const balance = await prisma.leaveBalance.findUnique({
            where: { staffId_fiscalYear: { staffId, fiscalYear } },
            include: {
                staff: {
                    select: { standardWorkHours: true }
                }
            }
        });

        return NextResponse.json({ balance, fiscalYear });
    } catch (error) {
        console.error("Leave balance get error:", error);
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
        const { grantedDays, carriedOverDays } = body;

        const newGrantedDays = parseFloat(grantedDays);
        const newCarriedOverDays = parseFloat(carriedOverDays);
        if (isNaN(newGrantedDays) || newGrantedDays < 0 || isNaN(newCarriedOverDays) || newCarriedOverDays < 0) {
            return NextResponse.json({ error: "無効な日数です" }, { status: 400 });
        }

        const now = new Date();
        const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

        const existing = await prisma.leaveBalance.findUnique({
            where: { staffId_fiscalYear: { staffId, fiscalYear } }
        });

        let balance;
        if (existing) {
            const totalDays = newGrantedDays + newCarriedOverDays;
            const remainingDays = totalDays - existing.usedDays;
            balance = await prisma.leaveBalance.update({
                where: { id: existing.id },
                data: {
                    grantedDays: newGrantedDays,
                    carriedOverDays: newCarriedOverDays,
                    totalDays,
                    remainingDays: Math.max(0, remainingDays),
                }
            });
        } else {
            const totalDays = newGrantedDays + newCarriedOverDays;
            balance = await prisma.leaveBalance.create({
                data: {
                    staffId,
                    fiscalYear,
                    grantedDays: newGrantedDays,
                    carriedOverDays: newCarriedOverDays,
                    totalDays,
                    usedDays: 0,
                    remainingDays: totalDays,
                }
            });
        }

        return NextResponse.json({ success: true, balance });
    } catch (error) {
        console.error("Leave balance post error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
