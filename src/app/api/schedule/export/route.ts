import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import * as xlsx from "xlsx";

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }
        const session = JSON.parse(sessionCookie.value);
        const orgId = session.orgId;

        const { searchParams } = new URL(req.url);
        const month = searchParams.get("month"); // YYYY-MM

        if (!month) {
            return NextResponse.json({ error: "month is required" }, { status: 400 });
        }

        const schedules = await prisma.schedule.findMany({
            where: {
                orgId,
                date: {
                    startsWith: month
                }
            },
            orderBy: {
                date: "asc"
            }
        });

        const leaves = await prisma.leaveRequest.findMany({
            where: {
                leaveDate: {
                    startsWith: month
                },
                staff: {
                    orgId
                }
            },
            include: {
                staff: true
            }
        });

        const leaveTypeToText = (type: string) => {
            if (type === "FULL_DAY") return "全休";
            if (type === "HALF_DAY") return "半休";
            if (type === "HOURLY") return "時間有休";
            if (type === "SPECIAL_PUBLIC") return "指定休";
            if (type === "SPECIAL_SICK") return "特休（感染症）";
            return type;
        };

        const statusToText = (status: string) => {
            if (status === "APPROVED") return "承認済";
            if (status === "PENDING") return "申請中";
            if (status === "REJECTED") return "却下";
            return status;
        };

        // Excel用データ作成
        const excelData: any[] = [];

        schedules.forEach(s => {
            excelData.push({
                "日付": s.date.replace(/-/g, "/"),
                "タイトル": s.title,
                "開始時間": s.startTime || "",
                "終了時間": s.endTime || "",
                "種別・メモ": s.type || ""
            });
        });

        leaves.forEach(l => {
            const leaveText = `${leaveTypeToText(l.leaveType)}${l.leaveType === "HALF_DAY" ? `(${l.halfDayPeriod === "AM" ? "午前" : "午後"})` : l.leaveType === "HOURLY" ? `(${l.leaveHours}時間)` : ""}`;
            excelData.push({
                "日付": l.leaveDate.replace(/-/g, "/"),
                "タイトル": `【休暇】${l.staff.name} - ${leaveText} [${statusToText(l.status)}]`,
                "開始時間": "",
                "終了時間": "",
                "種別・メモ": l.reason || ""
            });
        });

        // 日付順に並び替え
        excelData.sort((a, b) => a["日付"].localeCompare(b["日付"]));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(excelData);

        // ヘッダーを追加する場合は列幅などの調整も可能
        ws['!cols'] = [
            { wch: 12 }, // 日付
            { wch: 20 }, // タイトル
            { wch: 10 }, // 開始時間
            { wch: 10 }, // 終了時間
            { wch: 20 }  // 種別・メモ
        ];

        xlsx.utils.book_append_sheet(wb, ws, "Schedules");

        const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

        return new NextResponse(buf, {
            status: 200,
            headers: {
                "Content-Disposition": `attachment; filename="schedules_${month}.xlsx"`,
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
        });

    } catch (error) {
        console.error("Export schedules error", error);
        return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
    }
}
