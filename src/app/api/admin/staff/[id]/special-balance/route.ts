import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getFiscalYear } from "@/lib/engine/calculator";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);

        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const resolvedParams = await params;
        const staffId = resolvedParams.id;

        const fiscalYear = getFiscalYear(new Date());

        const specialBalances = await prisma.specialLeaveBalance.findMany({
            where: { staffId, fiscalYear },
        });

        return NextResponse.json({ specialBalances, fiscalYear });
    } catch (error) {
        console.error("Special balance get error:", error);
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
        const { leaveType, totalDays } = body;

        const fiscalYear = getFiscalYear(new Date());

        const existing = await prisma.specialLeaveBalance.findUnique({
            where: {
                staffId_fiscalYear_leaveType: {
                    staffId,
                    fiscalYear,
                    leaveType,
                }
            }
        });

        let balance;
        if (existing) {
            balance = await prisma.specialLeaveBalance.update({
                where: { id: existing.id },
                data: { totalDays: parseFloat(totalDays) }
            });
        } else {
            balance = await prisma.specialLeaveBalance.create({
                data: {
                    staffId,
                    fiscalYear,
                    leaveType,
                    totalDays: parseFloat(totalDays),
                    usedDays: 0,
                }
            });
        }

        return NextResponse.json({ success: true, balance });
    } catch (error) {
        console.error("Special balance post error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
