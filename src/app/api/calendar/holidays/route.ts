import { NextRequest, NextResponse } from "next/server";
import { getJapaneseHolidays } from "@/lib/holidays";

// 指定年の祝日一覧を返すAPI
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const holidays = getJapaneseHolidays(year);
    const result: Record<string, string> = {};
    for (const [date, name] of holidays) {
        result[date] = name;
    }

    return NextResponse.json({ holidays: result });
}
