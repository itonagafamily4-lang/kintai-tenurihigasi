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

        return NextResponse.json({ schedules });
    } catch (error) {
        console.error("Fetch schedules error", error);
        return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }
        const session = JSON.parse(sessionCookie.value);
        const orgId = session.orgId;

        const body = await req.json();
        const { date, title, startTime, endTime, type, isWorkOverride, targetType, targetValue } = body;

        if (!date || !title) {
            return NextResponse.json({ error: "日付とタイトルは必須です" }, { status: 400 });
        }

        const schedule = await prisma.schedule.create({
            data: {
                orgId,
                date,
                title,
                startTime: startTime || null,
                endTime: endTime || null,
                isWorkOverride: !!isWorkOverride,
                targetType: targetType || "ALL",
                targetValue: targetValue || null,
                type: type || null,
            }
        });

        return NextResponse.json({ schedule });
    } catch (error) {
        console.error("Create schedule error", error);
        return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }
        const session = JSON.parse(sessionCookie.value);
        const orgId = session.orgId;

        const body = await req.json();
        const { id, title, startTime, endTime, type, isWorkOverride, targetType, targetValue } = body;

        if (!id || !title) {
            return NextResponse.json({ error: "IDとタイトルは必須です" }, { status: 400 });
        }

        const existing = await prisma.schedule.findUnique({ where: { id } });
        if (!existing || existing.orgId !== orgId) {
            return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
        }

        const schedule = await prisma.schedule.update({
            where: { id },
            data: {
                title,
                startTime: startTime || null,
                endTime: endTime || null,
                isWorkOverride: isWorkOverride !== undefined ? !!isWorkOverride : existing.isWorkOverride,
                targetType: targetType !== undefined ? targetType : existing.targetType,
                targetValue: targetValue !== undefined ? targetValue : existing.targetValue,
                type: type || null,
            }
        });

        return NextResponse.json({ schedule });
    } catch (error) {
        console.error("Update schedule error", error);
        return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }
        const session = JSON.parse(sessionCookie.value);
        const orgId = session.orgId;

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "id is required" }, { status: 400 });
        }

        const existing = await prisma.schedule.findUnique({ where: { id } });
        if (!existing || existing.orgId !== orgId) {
            return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
        }

        await prisma.schedule.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete schedule error", error);
        return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
    }
}
