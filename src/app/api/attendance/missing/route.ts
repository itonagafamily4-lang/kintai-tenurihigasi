import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getJstDateString } from "@/lib/date-utils";

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);

        // 昨日の日付文字列を取得 "YYYY-MM-DD"
        const today = getJstDateString();
        const jstNow = new Date(today);
        jstNow.setDate(jstNow.getDate() - 1);
        const yesterdayStr = jstNow.toISOString().split('T')[0];

        // 過去の勤務記録のうち、出勤時間または退勤時間が未入力のものを探す
        const missingRecords = await prisma.attendance.findMany({
            where: {
                staffId: session.id,
                workDate: {
                    lte: yesterdayStr
                },
                OR: [
                    { clockIn: null },
                    { clockOut: null },
                    { status: "CLOCKED_IN" }
                ],
                dayType: {
                    notIn: ["PUBLIC_HOLIDAY", "SPECIAL_SICK"]
                }
            },
            orderBy: {
                workDate: "desc"
            },
            take: 20
        });

        if (missingRecords.length > 0) {
            const missingDates = missingRecords.map((r: any) => r.workDate);
            
            // 承認済みの全休の申請リストを取得
            const fullDayLeaves = await prisma.leaveRequest.findMany({
                where: {
                    staffId: session.id,
                    leaveDate: { in: missingDates },
                    status: "APPROVED",
                    leaveType: { in: ["FULL_DAY", "SPECIAL_OTHER", "SPECIAL_SICK"] }
                }
            });

            const leaveDates = new Set(fullDayLeaves.map((l: any) => l.leaveDate));
            
            // 休暇ではない本当の打刻漏れを探す
            const realMissing = missingRecords.find((r: any) => !leaveDates.has(r.workDate));

            if (realMissing) {
                return NextResponse.json({
                    hasMissing: true,
                    date: realMissing.workDate,
                    message: `${realMissing.workDate} の打刻が漏れています。履歴から修正してください。`
                });
            }
        }

        return NextResponse.json({ hasMissing: false });
    } catch (error) {
        console.error("Missing attendance check error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
