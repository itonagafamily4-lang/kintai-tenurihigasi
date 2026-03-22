import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

// チーム全体の休暇データを取得するAPI
export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const session = cookieStore.get("session");
    if (!session) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    let sessionData;
    try {
        sessionData = JSON.parse(session.value);
    } catch {
        return NextResponse.json({ error: "セッションが不正です" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

    // 月の開始日と終了日
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    try {
        // 同じ組織の全職員の承認済み休暇を取得（自分以外）
        const teamLeaves = await prisma.leaveRequest.findMany({
            where: {
                staff: {
                    orgId: sessionData.orgId,
                },
                staffId: { not: sessionData.id },
                leaveDate: {
                    gte: startDate,
                    lte: endDate,
                },
                status: "APPROVED",
            },
            include: {
                staff: {
                    select: {
                        name: true,
                        employeeNo: true,
                    },
                },
            },
            orderBy: { leaveDate: "asc" },
        });

        // 日付ごとにグループ化
        const byDate: Record<string, Array<{
            staffName: string;
            employeeNo: string;
            leaveType: string;
            halfDayPeriod: string | null;
            leaveHours: number | null;
            leaveStartTime: string | null;
            leaveEndTime: string | null;
            reason: string | null;
        }>> = {};

        for (const lv of teamLeaves) {
            if (!byDate[lv.leaveDate]) {
                byDate[lv.leaveDate] = [];
            }
            byDate[lv.leaveDate].push({
                staffName: lv.staff.name,
                employeeNo: lv.staff.employeeNo,
                leaveType: lv.leaveType,
                halfDayPeriod: lv.halfDayPeriod,
                leaveHours: lv.leaveHours,
                leaveStartTime: lv.leaveStartTime,
                leaveEndTime: lv.leaveEndTime,
                reason: lv.reason,
            });
        }

        return NextResponse.json({ teamLeaves: byDate });
    } catch (error) {
        console.error("Team leave fetch error:", error);
        return NextResponse.json({ error: "チーム休暇の取得に失敗しました" }, { status: 500 });
    }
}
