import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isHolidayOrSunday } from "@/lib/holidays";
import { getFiscalYear } from "@/lib/engine/calculator";

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);
        const body = await req.json();
        const { leaveDate, leaveType, leaveHours, leaveStartTime, leaveEndTime, halfDayPeriod, reason } = body;

        // バリデーション
        if (!leaveDate || !leaveType) {
            return NextResponse.json({ error: "日付と休暇種別は必須です" }, { status: 400 });
        }

        const validTypes = ["FULL_DAY", "HALF_DAY", "HOURLY", "SPECIAL_OTHER", "SPECIAL_SICK"];
        if (!validTypes.includes(leaveType)) {
            return NextResponse.json({ error: "無効な休暇種別です" }, { status: 400 });
        }

        if (leaveType === "HOURLY" && (!leaveStartTime || !leaveEndTime)) {
            return NextResponse.json({ error: "時間有休の場合は開始・終了時間の入力が必要です" }, { status: 400 });
        }

        // 日曜日・祝日チェック
        const holidayCheck = isHolidayOrSunday(leaveDate);
        if (holidayCheck.isHoliday) {
            return NextResponse.json({
                error: `${holidayCheck.reason}のため休暇申請できません`,
            }, { status: 400 });
        }

        // 同じ日に既に申請がないか確認
        const existing = await prisma.leaveRequest.findFirst({
            where: {
                staffId: session.id,
                leaveDate,
                status: { in: ["PENDING", "APPROVED"] },
            },
        });

        if (existing) {
            return NextResponse.json({ error: "この日はすでに休暇申請があります" }, { status: 400 });
        }

        // 感染症特休の場合、日数カウント
        let sickDayNumber: number | null = null;
        if (leaveType === "SPECIAL_SICK") {
            const existingSick = await prisma.leaveRequest.count({
                where: {
                    staffId: session.id,
                    leaveType: "SPECIAL_SICK",
                    status: "APPROVED",
                },
            });
            sickDayNumber = existingSick + 1;

            // 3日超えた場合は有休に自動切替
            if (sickDayNumber > 3) {
                return NextResponse.json({
                    error: `感染症特休は3日までです（現在${existingSick}日使用済み）。有休として申請してください。`,
                }, { status: 400 });
            }
        }

        // 有休残高・時間有休チェック（全日・半日・時間の場合）
        if (leaveType === "FULL_DAY" || leaveType === "HALF_DAY" || leaveType === "HOURLY") {
            const fiscalYear = getFiscalYear(leaveDate);
            const balance = await prisma.leaveBalance.findUnique({
                where: {
                    staffId_fiscalYear: {
                        staffId: session.id,
                        fiscalYear,
                    },
                },
            });

            if (balance) {
                const staff = await prisma.staff.findUnique({ where: { id: session.id } });
                const standardHours = staff?.standardWorkHours || 8.0;

                let deduction = 0;
                if (leaveType === "FULL_DAY") deduction = 1;
                else if (leaveType === "HALF_DAY") deduction = 0.5;

                // 時間有休の場合の年間上限チェック
                if (leaveType === "HOURLY" && leaveHours) {
                    const hourUnit = Math.ceil(standardHours);
                    const timeLeaveLimitHours = hourUnit * 5;

                    // 承認済み + 申請中の時間有給を合算
                    const pendingHourlyRequests = await prisma.leaveRequest.findMany({
                        where: {
                            staffId: session.id,
                            leaveType: "HOURLY",
                            status: "PENDING",
                            leaveDate: {
                                gte: `${fiscalYear}-04-01`,
                                lte: `${fiscalYear + 1}-03-31`,
                            }
                        }
                    });

                    const pendingHours = pendingHourlyRequests.reduce((sum, r) => sum + (r.leaveHours || 0), 0);
                    const timeLeaveUsedHours = (balance.timeLeaveUsedHours || 0) + pendingHours;

                    if (timeLeaveUsedHours + leaveHours > timeLeaveLimitHours) {
                        return NextResponse.json({
                            error: `年間で取得できる時間有休の上限（${timeLeaveLimitHours}時間 = 5日分相当）を超えています（取得済・申請中合計: ${timeLeaveUsedHours}時間）`,
                        }, { status: 400 });
                    }

                    // 残日数チェック用も新しい単位で計算
                    deduction = leaveHours / hourUnit;
                }

                if (balance.remainingDays < deduction) {
                    return NextResponse.json({
                        error: `有休残日数が不足しています（残り: ${balance.remainingDays}日分）`,
                    }, { status: 400 });
                }
            }
        }

        // 申請を作成
        const leaveRequest = await prisma.leaveRequest.create({
            data: {
                staffId: session.id,
                leaveDate,
                leaveType,
                leaveHours: leaveHours || null,
                leaveStartTime: leaveType === "HOURLY" ? (leaveStartTime || null) : null,
                leaveEndTime: leaveType === "HOURLY" ? (leaveEndTime || null) : null,
                halfDayPeriod: halfDayPeriod || null,
                reason: reason || null,
                sickDayNumber,
                status: "PENDING",
            },
        });

        return NextResponse.json({
            success: true,
            leaveRequest,
            message: "休暇申請を送信しました",
        });
    } catch (error) {
        console.error("Leave request API error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
