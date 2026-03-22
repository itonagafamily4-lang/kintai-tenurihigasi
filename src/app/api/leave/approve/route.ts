import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);

        // 管理者のみ
        if (session.role !== "ADMIN") {
            return NextResponse.json({ error: "権限がありません" }, { status: 403 });
        }

        const body = await req.json();
        const { requestId, action, comment } = body;

        if (!requestId || !action) {
            return NextResponse.json({ error: "requestIdとactionは必須です" }, { status: 400 });
        }

        if (!["APPROVED", "REJECTED"].includes(action)) {
            return NextResponse.json({ error: "無効なアクションです" }, { status: 400 });
        }

        // 申請を取得
        const leaveRequest = await prisma.leaveRequest.findUnique({
            where: { id: requestId },
            include: { staff: true },
        });

        if (!leaveRequest) {
            return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
        }

        if (leaveRequest.status !== "PENDING") {
            return NextResponse.json({ error: "この申請はすでに処理されています" }, { status: 400 });
        }

        // 同じ組織の職員であるか確認
        if (leaveRequest.staff.orgId !== session.orgId) {
            return NextResponse.json({ error: "権限がありません" }, { status: 403 });
        }

        // トランザクションで承認処理
        const result = await prisma.$transaction(async (tx) => {
            // 申請ステータスを更新
            const updated = await tx.leaveRequest.update({
                where: { id: requestId },
                data: { status: action },
            });

            // 承認記録を作成
            await tx.leaveApproval.create({
                data: {
                    requestId,
                    approvedBy: session.id,
                    action,
                    comment: comment || null,
                },
            });

            // 承認の場合、有休残高を更新
            if (action === "APPROVED") {
                const leaveType = leaveRequest.leaveType;
                if (leaveType === "FULL_DAY" || leaveType === "HALF_DAY" || leaveType === "HOURLY") {
                    const now = new Date();
                    const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

                    const staff = await tx.staff.findUnique({ where: { id: leaveRequest.staffId } });
                    const standardHours = staff?.standardWorkHours || 8.0;
                    const hourUnit = Math.ceil(standardHours);

                    let deduction = 0;
                    let incrementTimeLeave = 0;
                    if (leaveType === "FULL_DAY") deduction = 1;
                    else if (leaveType === "HALF_DAY") deduction = 0.5;
                    else if (leaveType === "HOURLY" && leaveRequest.leaveHours) {
                        deduction = leaveRequest.leaveHours / hourUnit;
                        incrementTimeLeave = leaveRequest.leaveHours;
                    }

                    const balance = await tx.leaveBalance.findUnique({
                        where: {
                            staffId_fiscalYear: {
                                staffId: leaveRequest.staffId,
                                fiscalYear,
                            },
                        },
                    });

                    if (balance) {
                        await tx.leaveBalance.update({
                            where: { id: balance.id },
                            data: {
                                usedDays: { increment: deduction },
                                remainingDays: { decrement: deduction },
                                ...(leaveType === "HOURLY" ? { timeLeaveUsedHours: { increment: incrementTimeLeave } } : {})
                            },
                        });
                    }
                }

                // 勤怠テーブルにも記録
                const dayType =
                    leaveType === "SPECIAL_OTHER" ? "WORK" :
                    leaveType === "SPECIAL_SICK" ? "SPECIAL_SICK" :
                    "WORK";

                const existingAttendance = await tx.attendance.findUnique({
                    where: {
                        staffId_workDate: {
                            staffId: leaveRequest.staffId,
                            workDate: leaveRequest.leaveDate,
                        },
                    },
                });

                if (existingAttendance) {
                    await tx.attendance.update({
                        where: { id: existingAttendance.id },
                        data: {
                            hourlyLeave: leaveType === "HOURLY"
                                ? { increment: leaveRequest.leaveHours || 0 }
                                : existingAttendance.hourlyLeave,
                            dayType: leaveType === "FULL_DAY" ? "WORK" : existingAttendance.dayType,
                            status: leaveType === "FULL_DAY" ? "COMPLETED" : existingAttendance.status,
                            memo: leaveType === "FULL_DAY"
                                ? `有休（${leaveRequest.reason || ""}）`
                                : existingAttendance.memo,
                        },
                    });
                } else {
                    // 新規作成
                    await tx.attendance.create({
                        data: {
                            staffId: leaveRequest.staffId,
                            workDate: leaveRequest.leaveDate,
                            dayType: leaveType === "FULL_DAY" || leaveType === "HOURLY" ? "WORK" : dayType,
                            status: leaveType === "FULL_DAY" ? "COMPLETED" : "NOT_CLOCKED_IN",
                            hourlyLeave: leaveType === "HOURLY" ? (leaveRequest.leaveHours || 0) : 0,
                            memo: leaveType === "FULL_DAY" ? `有休（${leaveRequest.reason || ""}）` : null,
                        },
                    });
                }
            }

            return updated;
        });

        return NextResponse.json({
            success: true,
            leaveRequest: result,
            message: action === "APPROVED" ? "承認しました" : "却下しました",
        });
    } catch (error) {
        console.error("Leave approve API error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
