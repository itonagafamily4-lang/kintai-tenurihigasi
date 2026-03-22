import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

// カレンダーのイベントを取得するAPI
export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const yearStr = searchParams.get("year");
    const monthStr = searchParams.get("month");
    const year = parseInt(yearStr || String(new Date().getFullYear()));
    const month = parseInt(monthStr || String(new Date().getMonth() + 1));

    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    const byDate: Record<string, Array<{
        title: string;
        description: string | null;
        isAllDay: boolean;
        startTime: string | null;
        endTime: string | null;
    }>> = {};

    // 1. DB (Excelインポートしたスケジュール) を取得してセット
    try {
        const sessionData = JSON.parse(sessionCookie.value);
        const orgId = sessionData.orgId;

        const dbSchedules = await prisma.schedule.findMany({
            where: {
                orgId,
                date: { startsWith: monthPrefix }
            }
        });

        for (const sched of dbSchedules) {
            if (!byDate[sched.date]) {
                byDate[sched.date] = [];
            }
            byDate[sched.date].push({
                title: sched.title,
                description: sched.type || null,
                isAllDay: !sched.startTime && !sched.endTime,
                startTime: sched.startTime,
                endTime: sched.endTime,
            });
        }
    } catch (dbErr) {
        console.error("DB schedule fetch error:", dbErr);
    }

    // 2. Googleカレンダー (設定されている場合のみマージ)
    const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    if (apiKey && calendarId) {
        const timeMin = new Date(year, month - 1, 1).toISOString();
        const timeMax = new Date(year, month, 0, 23, 59, 59).toISOString();

        try {
            const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
            url.searchParams.set("key", apiKey);
            url.searchParams.set("timeMin", timeMin);
            url.searchParams.set("timeMax", timeMax);
            url.searchParams.set("singleEvents", "true");
            url.searchParams.set("orderBy", "startTime");
            url.searchParams.set("maxResults", "100");

            const res = await fetch(url.toString(), { next: { revalidate: 300 } }); // 5分キャッシュ
            if (res.ok) {
                const data = await res.json();
                interface GoogleCalendarEventItem {
                    summary?: string;
                    description?: string;
                    start?: { date?: string; dateTime?: string };
                    end?: { date?: string; dateTime?: string };
                    colorId?: string;
                }

                const events = (data.items || []).map((item: GoogleCalendarEventItem) => {
                    const startDate = item.start?.date || item.start?.dateTime?.split("T")[0] || "";
                    const endDate = item.end?.date || item.end?.dateTime?.split("T")[0] || "";
                    const isAllDay = !!item.start?.date;

                    return {
                        title: item.summary || "(タイトルなし)",
                        description: item.description || null,
                        startDate,
                        endDate,
                        isAllDay,
                        startTime: isAllDay ? null : item.start?.dateTime?.split("T")[1]?.substring(0, 5) || null,
                        endTime: isAllDay ? null : item.end?.dateTime?.split("T")[1]?.substring(0, 5) || null,
                    };
                });

                for (const event of events) {
                    const start = new Date(event.startDate);
                    const end = event.isAllDay
                        ? new Date(new Date(event.endDate).getTime() - 86400000)
                        : new Date(event.endDate);

                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        const dateStr = d.toISOString().split("T")[0];
                        if (!byDate[dateStr]) {
                            byDate[dateStr] = [];
                        }
                        byDate[dateStr].push({
                            title: event.title,
                            description: event.description,
                            isAllDay: event.isAllDay,
                            startTime: event.startTime,
                            endTime: event.endTime,
                        });
                    }
                }
            } else {
                console.error("Google Calendar API fetch error:", res.status);
            }
        } catch (error) {
            console.error("Calendar events fetch error:", error);
        }
    }

    return NextResponse.json({ events: byDate });
}
