import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

function getClosingPeriod(year: number, month: number, closingDay: number) {
    const endDate = new Date(year, month - 1, closingDay);
    const startDate = new Date(year, month - 2, closingDay + 1);
    return { startDate, endDate };
}

function formatDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });

        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const now = new Date();
        const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
        const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));

        const org = await prisma.organization.findFirst({ where: { id: session.orgId } });
        const closingDay = org?.closingDay || 10;
        const mealPrice = 300;

        const { startDate, endDate } = getClosingPeriod(year, month, closingDay);
        const startStr = formatDateStr(startDate);
        const endStr = formatDateStr(endDate);

        const allStaff = await prisma.staff.findMany({
            where: { orgId: session.orgId, isActive: true },
            orderBy: { employeeNo: "asc" },
        });

        const allAttendances = await prisma.attendance.findMany({
            where: {
                staff: { orgId: session.orgId },
                workDate: { gte: startStr, lte: endStr },
            },
        });

        const allLeaves = await prisma.leaveRequest.findMany({
            where: {
                staff: { orgId: session.orgId },
                leaveDate: { gte: startStr, lte: endStr },
                status: "APPROVED",
            },
        });

        const groups: Record<string, typeof allStaff> = {
            REGULAR: allStaff.filter((s) => s.employmentType === "REGULAR"),
            SHORT_TIME: allStaff.filter((s) => s.employmentType === "SHORT_TIME"),
            PART_TIME: allStaff.filter((s) => s.employmentType === "PART_TIME"),
        };

        const groupLabels: Record<string, string> = {
            REGULAR: "正規職員",
            SHORT_TIME: "時短職員",
            PART_TIME: "パート職員",
        };

        const aoa: any[][] = [];

        aoa.push(["スマート保育DX 月次勤怠集計表"]);
        aoa.push([`対象期間: ${startStr} 〜 ${endStr} (${month}月分)`]);
        aoa.push([`出力日: ${formatDateStr(now)}`]);
        aoa.push([`法人名: ${org?.name || ""}`]);
        aoa.push([]);

        const totals = { people: 0, workDays: 0, workHours: 0, overtime: 0, late: 0, early: 0, meals: 0, mealCost: 0 };

        for (const [type, staff] of Object.entries(groups)) {
            if (staff.length === 0) continue;

            aoa.push([`▼ ${groupLabels[type]}`]);
            const headers = ["職員番号", "氏名", "出勤日数", "実労働合計(h)"];
            if (type !== "PART_TIME") headers.push("残業合計(h)");
            if (type === "SHORT_TIME") headers.push("時短合計");
            headers.push("特休日数", "有休使用(日)", "時間有給(h)", "感染症特休(日)", "食事回数", "食事代合計(円)", "備考");
            aoa.push(headers);

            let groupTotals = { people: 0, workDays: 0, workHours: 0, overtime: 0, late: 0, early: 0, meals: 0 };

            for (const s of staff) {
                const att = allAttendances.filter((a) => a.staffId === s.id);
                const lv = allLeaves.filter((l) => l.staffId === s.id);

                const workDays = att.filter((a) => a.status === "COMPLETED").length;
                const workHours = att.reduce((sum, a) => sum + a.actualWorkHours, 0);
                const overtime = att.reduce((sum, a) => sum + a.overtimeHours, 0);
                const shortTime = att.reduce((sum, a) => sum + a.shortTimeValue, 0);
                const publicHolidays = att.filter((a) => a.dayType === "PUBLIC_HOLIDAY").length;
                const paidLeave = lv.filter((l) => l.leaveType === "FULL_DAY" || l.leaveType === "HALF_DAY").length;
                const hourlyLeave = att.reduce((sum, a) => sum + a.hourlyLeave, 0);
                const sickLeave = lv.filter((l) => l.leaveType === "SPECIAL_SICK").length;
                const meals = att.reduce((sum, a) => sum + a.mealCount, 0);
                const mealCost = meals * mealPrice;
                const sickNotes = lv.filter((l) => l.leaveType === "SPECIAL_SICK").map((l) => l.reason).filter(Boolean);
                const attNotes = att.map(a => a.memo).filter(Boolean);
                const allNotes = [...sickNotes, ...attNotes];
                const memo = allNotes.length > 0 ? allNotes.join("; ") : "";

                // キーワード集計（遅刻・早退）
                const lateCount = att.filter(a => a.memo && a.memo.includes("遅刻")).length;
                const earlyCount = att.filter(a => a.memo && a.memo.includes("早退")).length;

                const row: any[] = [s.employeeNo, s.name, workDays, workHours.toFixed(2)];
                if (type !== "PART_TIME") row.push(overtime.toFixed(2));
                if (type === "SHORT_TIME") row.push(shortTime.toFixed(1));
                row.push(
                    String(publicHolidays),
                    String(paidLeave),
                    String(hourlyLeave),
                    String(sickLeave),
                    String(lateCount),
                    String(earlyCount),
                    String(meals),
                    String(mealCost),
                    memo
                );
                aoa.push(row);

                groupTotals.people++;
                groupTotals.workDays += workDays;
                groupTotals.workHours += workHours;
                groupTotals.overtime += overtime;
                groupTotals.meals += meals;
                groupTotals.late += lateCount;
                groupTotals.early += earlyCount;
            }

            aoa.push([]);
            totals.people += groupTotals.people;
            totals.workDays += groupTotals.workDays;
            totals.workHours += groupTotals.workHours;
            totals.overtime += groupTotals.overtime;
            totals.meals += groupTotals.meals;
            totals.late += groupTotals.late;
            totals.early += groupTotals.early;
        }

        aoa.push(["▼ 全体サマリー"]);
        aoa.push(["区分", "人数", "総出勤日数", "総実労働(h)", "総残業(h)", "総遅刻回数", "総早退回数", "総食事回数", "総食事代(円)"]);
        for (const [type, staff] of Object.entries(groups)) {
            if (staff.length === 0) continue;
            const staffIds = staff.map(s => s.id);
            const att = allAttendances.filter((a) => staffIds.includes(a.staffId));
            const wd = att.filter((a) => a.status === "COMPLETED").length;
            const wh = att.reduce((sum, a) => sum + a.actualWorkHours, 0);
            const ot = att.reduce((sum, a) => sum + a.overtimeHours, 0);
            const ml = att.reduce((sum, a) => sum + a.mealCount, 0);
            const lc = att.filter(a => a.memo && a.memo.includes("遅刻")).length;
            const ec = att.filter(a => a.memo && a.memo.includes("早退")).length;

            aoa.push([
                groupLabels[type],
                staff.length,
                wd,
                wh.toFixed(2),
                type !== "PART_TIME" ? ot.toFixed(2) : "—",
                lc,
                ec,
                ml,
                ml * mealPrice
            ]);
        }
        totals.mealCost = totals.meals * mealPrice;
        aoa.push([
            "合計",
            totals.people,
            totals.workDays,
            totals.workHours.toFixed(2),
            totals.overtime.toFixed(2),
            totals.late,
            totals.early,
            totals.meals,
            totals.mealCost
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, "勤怠集計");

        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        const fileName = `勤怠集計_${year}年${month}月分_${org?.name || "保育園"}.xlsx`;
        return new NextResponse(buf, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
            },
        });
    } catch (error) {
        console.error("Excel API error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
