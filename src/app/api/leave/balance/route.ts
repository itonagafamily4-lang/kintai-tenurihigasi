import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);

        // 現在の年度を計算（4月始まり）
        const now = new Date();
        const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

        // 有休残高を取得
        let balance = await prisma.leaveBalance.findUnique({
            where: {
                staffId_fiscalYear: {
                    staffId: session.id,
                    fiscalYear,
                },
            },
            include: {
                staff: {
                    select: { standardWorkHours: true }
                }
            }
        });

        // 残高がない場合はデフォルト値を作成
        if (!balance) {
            balance = await prisma.leaveBalance.create({
                data: {
                    staffId: session.id,
                    fiscalYear,
                    totalDays: 10, // デフォルトの有休日数
                    usedDays: 0,
                    remainingDays: 10,
                },
                include: {
                    staff: {
                        select: { standardWorkHours: true }
                    }
                }
            });
        }

        // 今年度の使用状況の内訳を取得
        const startDate = `${fiscalYear}-04-01`;
        const endDate = `${fiscalYear + 1}-03-31`;

        const leaveRequests = await prisma.leaveRequest.findMany({
            where: {
                staffId: session.id,
                leaveDate: {
                    gte: startDate,
                    lte: endDate,
                },
                status: { in: ["APPROVED", "PENDING"] },
            },
            orderBy: { leaveDate: "desc" },
        });

        const breakdown = {
            fullDay: leaveRequests.filter((l) => l.leaveType === "FULL_DAY" && l.status === "APPROVED").length,
            halfDay: leaveRequests.filter((l) => l.leaveType === "HALF_DAY" && l.status === "APPROVED").length,
            hourly: leaveRequests.filter((l) => l.leaveType === "HOURLY" && l.status === "APPROVED")
                .reduce((sum, l) => sum + (l.leaveHours || 0), 0),
            sickLeave: leaveRequests.filter((l) => l.leaveType === "SPECIAL_SICK" && l.status === "APPROVED").length,
            pending: leaveRequests.filter((l) => l.status === "PENDING").length,
        };

        return NextResponse.json({
            balance,
            breakdown,
            fiscalYear,
        });
    } catch (error) {
        console.error("Leave balance API error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
