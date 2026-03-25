import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const staffMembers = await prisma.staff.findMany({
            where: { orgId: session.orgId },
            orderBy: { employeeNo: "asc" },
        });

        // マッピング
        const exportData = staffMembers.map(staff => ({
            "職員番号": staff.employeeNo,
            "名前": staff.name,
            "ログインID": staff.loginId || "",
            // パスワードはエクスポートせず、インポート時の入力用として列を用意
            "パスワード(変更時のみ)": "",
            "雇用形態": staff.employmentType === "REGULAR" ? "正規" :
                staff.employmentType === "SHORT_TIME" ? "短時間" : "パート",
            "権限": staff.role === "ADMIN" ? "管理者" : "一般",
            "基本出勤時間": staff.defaultStart,
            "基本退勤時間": staff.defaultEnd,
            "1日の標準労働時間": staff.standardWorkHours,
            "休憩控除時間(h)": staff.breakTimeHours,
            "休憩発生しきい値(h)": staff.breakThresholdHours,
            "入社年月(YYYY-MM)": staff.joinDate || "",
            "ステータス": staff.isActive ? "有効" : "無効",
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "職員一覧");

        // 列幅の自動調整
        const wscols = [
            { wpx: 80 }, { wpx: 120 }, { wpx: 100 }, { wpx: 150 },
            { wpx: 80 }, { wpx: 60 }, { wpx: 100 }, { wpx: 100 },
            { wpx: 120 }, { wpx: 120 }, { wpx: 80 }
        ];
        ws['!cols'] = wscols;

        const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
        const now = new Date();
        const filename = `staff_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.xlsx`;

        return new NextResponse(excelBuffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error("Staff export error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
