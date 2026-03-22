import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);
        const { searchParams } = new URL(req.url);
        const statusFilter = searchParams.get("status"); // PENDING, APPROVED, REJECTED, or null (all)

        // 管理者は全員分を取得可能
        const isAdmin = session.role === "ADMIN";
        const targetStaffId = searchParams.get("staffId");

        const whereClause: Record<string, unknown> = {};

        if (isAdmin && !targetStaffId) {
            // 管理者で特定の職員指定なし → 同じ組織の全員分
            whereClause.staff = { orgId: session.orgId };
        } else {
            // 管理者が特定職員を指定 or 一般職員は自分のみ
            whereClause.staffId = targetStaffId || session.id;
        }

        if (statusFilter) {
            whereClause.status = statusFilter;
        }

        const leaveRequests = await prisma.leaveRequest.findMany({
            where: whereClause,
            include: {
                staff: {
                    select: { name: true, employeeNo: true },
                },
                approval: true,
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        return NextResponse.json({ leaveRequests });
    } catch (error) {
        console.error("Leave list API error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
