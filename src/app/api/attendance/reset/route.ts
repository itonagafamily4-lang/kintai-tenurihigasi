import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });

        const session = JSON.parse(sessionCookie.value);
        const { date } = await req.json();

        if (!date) return NextResponse.json({ error: "日付が必要です" }, { status: 400 });

        const record = await prisma.attendance.findUnique({
            where: {
                staffId_workDate: {
                    staffId: session.id,
                    workDate: date
                }
            }
        });

        if (record) {
            // 打刻情報と時間をクリア
            await prisma.attendance.update({
                where: { id: record.id },
                data: {
                    clockIn: null,
                    clockOut: null,
                    actualWorkHours: 0,
                    breakHours: 0,
                    overtimeHours: 0,
                    status: record.dayType === "WORK" || record.dayType === "SPECIAL_SICK" ? record.status : "MODIFIED"
                }
            });
        }

        return NextResponse.json({ success: true, message: "本日の打刻を取り消しました" });
    } catch (error) {
        console.error("Attendance reset error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
