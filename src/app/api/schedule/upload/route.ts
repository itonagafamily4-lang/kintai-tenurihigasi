import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as xlsx from "xlsx";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }
        const session = JSON.parse(sessionCookie.value);
        const orgId = session.orgId;

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file || !orgId) {
            return NextResponse.json(
                { error: "ファイルまたは組織情報が見つかりません" },
                { status: 400 }
            );
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const workbook = xlsx.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // ExcelのデータをJSON配列に変換
        // ヘッダー行を1行目と想定
        // A列: 日付 (YYYY/MM/DD) または (YYYY-MM-DD)、B列: タイトル、C列: 開始時間、D列: 終了時間、E列: メモ・種別
        const rows: any[] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length < 2) {
            return NextResponse.json({ error: "データが存在しません" }, { status: 400 });
        }

        // ヘッダーを除いたデータ行を処理
        const dataRows = rows.slice(1);
        const parsedSchedules: any[] = [];

        for (const row of dataRows) {
            // 空行はスキップ
            if (!row || row.length === 0 || !row[0]) continue;

            const dateValue = row[0];
            const title = row[1];

            if (!title) continue; // タイトルがなければスキップ

            let formattedDate = "";

            // 日付の正規化 (Excelのシリアル値の場合と文字列の場合を考慮)
            if (typeof dateValue === 'number') {
                const dateObj = xlsx.SSF.parse_date_code(dateValue);
                formattedDate = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
            } else if (typeof dateValue === 'string') {
                // 'YYYY/MM/DD' -> 'YYYY-MM-DD' に変換
                formattedDate = dateValue.replace(/\//g, '-');
            } else if (dateValue instanceof Date) {
                formattedDate = dateValue.toISOString().split("T")[0];
            }

            if (!formattedDate) continue;

            // 時間の正規化 (例: "09:00", 空白)
            const parseTime = (timeVal: any) => {
                if (!timeVal) return null;
                if (typeof timeVal === 'number') {
                    // Excelの時間はシリアル値の小数部分 (例: 0.5 = 12:00)
                    const totalMinutes = Math.round(timeVal * 24 * 60);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                }
                return String(timeVal);
            };

            const startTime = parseTime(row[2]);
            const endTime = parseTime(row[3]);
            const type = row[4] ? String(row[4]) : null;

            parsedSchedules.push({
                orgId,
                date: formattedDate,
                title: String(title),
                startTime,
                endTime,
                type,
            });
        }

        // 既存の予定に対するマージ戦略などがありますが、まずは全消し＆再登録（あるいは単純挿入）
        // ここでは同じ日付＆タイトルのものがあれば上書き、というよりシンプルにBulk Insertするか、
        // 既存データを一度消して入れ直す方針（同じ月のデータを消すなど）も考えられます。
        // リクエストが指定したデータのみを挿入・更新するようにupsertチックに処理します。

        // トランザクションで処理
        await prisma.$transaction(async (tx: any) => {
            for (const sched of parsedSchedules) {
                // 同じ日付・同じタイトル・同じ時間のものがないかチェック
                const existing = await tx.schedule.findFirst({
                    where: {
                        orgId: sched.orgId,
                        date: sched.date,
                        title: sched.title
                    }
                });

                if (existing) {
                    await tx.schedule.update({
                        where: { id: existing.id },
                        data: {
                            startTime: sched.startTime,
                            endTime: sched.endTime,
                            type: sched.type
                        }
                    });
                } else {
                    await tx.schedule.create({
                        data: sched
                    });
                }
            }
        });

        return NextResponse.json({ message: "スケジュールをインポートしました", count: parsedSchedules.length });

    } catch (error: any) {
        console.error("Schedule upload error:", error);
        return NextResponse.json(
            { error: "アップロード処理中にエラーが発生しました", details: error.message },
            { status: 500 }
        );
    }
}
