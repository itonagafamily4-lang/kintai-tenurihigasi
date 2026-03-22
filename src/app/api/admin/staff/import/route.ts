import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
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

        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const wb = XLSX.read(buffer, { type: "buffer" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        // ヘッダーがあることを期待
        const rows = XLSX.utils.sheet_to_json(ws);

        let successCount = 0;
        let updateCount = 0;
        let errorCount = 0;

        for (const row of rows as any[]) {
            const employeeNo = row["職員番号"]?.toString();
            const name = row["名前"];
            const loginId = row["ログインID"]?.toString() || employeeNo;
            const passwordRaw = row["パスワード(変更時のみ)"]?.toString();
            const empTypeStr = row["雇用形態"];
            const roleStr = row["権限"];
            const defaultStart = row["基本出勤時間"] || "08:30";
            const defaultEnd = row["基本退勤時間"] || "17:30";
            const standardWorkHours = parseFloat(row["1日の標準労働時間"]) || 8.0;
            const joinDate = row["入社年月(YYYY-MM)"]?.toString() || null;
            const isActiveStr = row["ステータス"];

            if (!employeeNo || !name || !loginId) {
                errorCount++;
                continue;
            }

            const employmentType = empTypeStr === "正規" ? "REGULAR" :
                empTypeStr === "短時間" ? "SHORT_TIME" : "PART_TIME";

            const role = roleStr === "管理者" ? "ADMIN" : "STAFF";
            const isActive = isActiveStr === "無効" ? false : true;

            const existingStaff = await prisma.staff.findFirst({
                where: {
                    orgId: session.orgId,
                    OR: [
                        { employeeNo },
                        { loginId }
                    ]
                }
            });

            if (existingStaff) {
                // Update
                const updateData: any = {
                    name,
                    employmentType,
                    role,
                    defaultStart,
                    defaultEnd,
                    standardWorkHours,
                    joinDate,
                    isActive,
                    loginId
                };

                if (passwordRaw) {
                    updateData.passwordHash = await bcrypt.hash(passwordRaw, 10);
                }

                await prisma.staff.update({
                    where: { id: existingStaff.id },
                    data: updateData
                });
                updateCount++;
            } else {
                // Create
                const passwordHash = await bcrypt.hash(passwordRaw || "password123", 10);
                await prisma.staff.create({
                    data: {
                        orgId: session.orgId,
                        employeeNo,
                        name,
                        loginId,
                        passwordHash,
                        employmentType,
                        role,
                        defaultStart,
                        defaultEnd,
                        // @ts-ignore
                        standardWorkHours,
                        joinDate,
                        isActive
                    }
                });
                successCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `インポート成功: 新規作成 ${successCount}件, 更新 ${updateCount}件 (エラー ${errorCount}件)`
        });

    } catch (error) {
        console.error("Staff import error:", error);
        return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
    }
}
