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
        const { requestId } = await req.json();

        if (!requestId) {
            return NextResponse.json({ error: "requestIdは必須です" }, { status: 400 });
        }

        const leaveRequest = await prisma.leaveRequest.findUnique({
            where: { id: requestId },
        });

        if (!leaveRequest) {
            return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
        }

        // 自分自身の申請か、もしくは自分が管理者であるか
        if (leaveRequest.staffId !== session.id && session.role !== "ADMIN") {
            return NextResponse.json({ error: "権限がありません" }, { status: 403 });
        }

        if (leaveRequest.status === "REJECTED" || leaveRequest.status === "CANCELED") {
            return NextResponse.json({ error: "この申請はすでに処理済・キャンセル済です" }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            // ステータスがAPPROVEDだった場合は有休残高を戻し、関連する勤怠記録を消す
            if (leaveRequest.status === "APPROVED") {
                const leaveType = leaveRequest.leaveType;
                if (leaveType === "FULL_DAY" || leaveType === "HALF_DAY") {
                    const now = new Date();
                    const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
                    const deduction = leaveType === "FULL_DAY" ? 1 : 0.5;

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
                                usedDays: { decrement: deduction },
                                remainingDays: { increment: deduction },
                            },
                        });
                    }
                }

                // 勤怠の自動記録があったら削除する
                const existingAttendance = await tx.attendance.findUnique({
                    where: {
                        staffId_workDate: {
                            staffId: leaveRequest.staffId,
                            workDate: leaveRequest.leaveDate,
                        },
                    },
                });

                if (existingAttendance && leaveType === "FULL_DAY") {
                    if (existingAttendance.clockIn === null && existingAttendance.clockOut === null) {
                        // 打刻されていなければレコードそのものを消す
                        await tx.attendance.delete({
                            where: { id: existingAttendance.id }
                        });
                    } else {
                        // 打刻されている場合は休暇を取り消して通常の勤務と同じように戻す
                        await tx.attendance.update({
                            where: { id: existingAttendance.id },
                            data: {
                                dayType: "WORK",
                                memo: existingAttendance.memo ? existingAttendance.memo.replace(/有休（.*?）|特休|病休/g, "").trim() : null
                            }
                        });
                    }
                }
            }

            // ステータスをCANCELEDにする
            await tx.leaveRequest.update({
                where: { id: requestId },
                data: { status: "CANCELED" }
            });

            // 承認記録がある場合は削除するか考慮（今回は申請自体を残すのでApprovalレコードもあれば残すか消すか、CANCELEDにするためのActionを追加するか）
            const approval = await tx.leaveApproval.findUnique({
                where: { requestId }
            });
            if (approval) {
                await tx.leaveApproval.delete({
                    where: { requestId }
                });
            }
        });

        return NextResponse.json({ success: true, message: "申請をキャンセルしました" });
    } catch (error) {
        console.error("Leave cancel error:", error);
        return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
    }
}
