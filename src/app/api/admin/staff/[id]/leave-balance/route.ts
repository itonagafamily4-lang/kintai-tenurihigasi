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
        const { grantedDays, carriedOverDays, carriedOverHours: rawCarriedOverHours } = body;

        const fiscalYear = getFiscalYear(new Date());

        const existing = await prisma.leaveBalance.findUnique({
            where: { staffId_fiscalYear: { staffId, fiscalYear } },
            include: { staff: true }
        });

        const staffToUse = existing?.staff || await prisma.staff.findUnique({ where: { id: staffId } });
        const stdHours = staffToUse?.standardWorkHours || 8;
        const hourlyLeaveUnit = Math.ceil(stdHours);

        // 時間有休の繰り上げ処理: 標準労働時間単位の時間を超えた場合は1日に繰り上げ
        let parsedCarriedOverHours = parseFloat(rawCarriedOverHours || "0");
        let adjustedCarriedOverDays = parseFloat(carriedOverDays);
        if (parsedCarriedOverHours >= hourlyLeaveUnit) {
            const extraDays = Math.floor(parsedCarriedOverHours / hourlyLeaveUnit);
            adjustedCarriedOverDays += extraDays;
            parsedCarriedOverHours = parsedCarriedOverHours % hourlyLeaveUnit;
        }
        parsedCarriedOverHours = Math.max(0, Math.min(hourlyLeaveUnit - 1, Math.round(parsedCarriedOverHours)));

        const newGrantedDays = parseFloat(grantedDays);
        const newCarriedOverDays = adjustedCarriedOverDays;
        if (isNaN(newGrantedDays) || newGrantedDays < 0 || isNaN(newCarriedOverDays) || newCarriedOverDays < 0) {
            return NextResponse.json({ error: "無効な日数です" }, { status: 400 });
        }

        // already fetched inside `existing` query above

        let balance;
        if (existing) {
            const totalDays = newGrantedDays + newCarriedOverDays;
            const remainingDays = totalDays - existing.usedDays;
            balance = await prisma.leaveBalance.update({
                where: { id: existing.id },
                data: {
                    grantedDays: newGrantedDays,
                    carriedOverDays: newCarriedOverDays,
                    carriedOverHours: parsedCarriedOverHours,
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
                    carriedOverHours: parsedCarriedOverHours,
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
