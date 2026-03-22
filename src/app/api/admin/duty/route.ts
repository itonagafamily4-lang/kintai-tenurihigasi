import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);

        if (!(prisma as any).dutyMaster) {
            return NextResponse.json({ duties: [] });
        }

        // 移行対象の存在チェック（無効なものも含めて確認）
        const allDuties = await (prisma as any).dutyMaster.findMany({
            where: { orgId: session.orgId },
        });
        const allExistingNames = new Set(allDuties.map((d: any) => d.name));
        const activeDuties = allDuties.filter((d: any) => d.isActive);

        const migrationTargets = [
            { name: "早出", start: "duty_early_start", end: "duty_early_end" },
            { name: "遅出", start: "duty_late_start", end: "duty_late_end" },
        ];

        const needsMigration = migrationTargets.filter(t => !allExistingNames.has(t.name));
        const needsReactivation = allDuties.filter((d: any) => 
            !d.isActive && migrationTargets.some(t => t.name === d.name)
        );

        let duties = activeDuties;

        // 再有効化が必要なものがあれば更新
        if (needsReactivation.length > 0) {
            for (const d of needsReactivation) {
                await (prisma as any).dutyMaster.update({
                    where: { id: d.id },
                    data: { isActive: true },
                });
            }
            // duties をリロード
            duties = await (prisma as any).dutyMaster.findMany({
                where: { orgId: session.orgId, isActive: true },
                orderBy: { startTime: "asc" },
            });
        }

        if (needsMigration.length > 0) {
            const settings = await prisma.settingMaster.findMany({
                where: { orgId: session.orgId },
            });
            const settingsMap: Record<string, string> = {};
            settings.forEach(s => { settingsMap[s.key] = s.value; });

            const toCreate = [];
            for (const target of needsMigration) {
                const startTime = settingsMap[target.start] || (target.name === "早出" ? "07:30" : "10:30");
                const endTime = settingsMap[target.end] || (target.name === "早出" ? "16:00" : "19:00");
                
                toCreate.push({
                    orgId: session.orgId,
                    name: target.name,
                    startTime,
                    endTime,
                    isActive: true
                });
            }

            if (toCreate.length > 0) {
                for (const data of toCreate) {
                    await (prisma as any).dutyMaster.create({ data });
                }
                duties = await (prisma as any).dutyMaster.findMany({
                    where: { orgId: session.orgId, isActive: true },
                    orderBy: { startTime: "asc" },
                });
            }
        }

        return NextResponse.json({ duties });
    } catch (error: any) {
        console.error("Duty GET error:", error);
        return NextResponse.json({ 
            error: "サーバーエラー", 
            detail: error.message 
        }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const { id, name, startTime, endTime, action } = await req.json();

        if (action === "DELETE") {
            if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
            await (prisma as any).dutyMaster.update({
                where: { id },
                data: { isActive: false },
            });
            return NextResponse.json({ success: true });
        }

        if (!name || !startTime || !endTime) {
            return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
        }

        if (id) {
            // 更新
            await (prisma as any).dutyMaster.update({
                where: { id },
                data: { name, startTime, endTime },
            });
        } else {
            // 新規作成
            await (prisma as any).dutyMaster.create({
                data: {
                    orgId: session.orgId,
                    name,
                    startTime,
                    endTime,
                },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Duty POST error:", error);
        return NextResponse.json({ 
            error: "サーバーエラー", 
            detail: error.message 
        }, { status: 500 });
    }
}
