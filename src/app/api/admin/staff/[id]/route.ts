import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import * as bcrypt from "bcryptjs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);

        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const resolvedParams = await params;
        const staffId = resolvedParams.id;
        const body = await req.json();

        const {
            name, email, loginId, employeeNo, employmentType, jobTitle, assignedClass, role,
            defaultStart, defaultEnd, standardWorkHours, password, joinDate,
            weeklyWorkDays, weeklyWorkHours, maternityLeaveStart, maternityLeaveEnd, childcareLeaveStart, childcareLeaveEnd, expectedReturnDate,
            breakTimeHours, breakThresholdHours, status
        } = body;

        // Validation
        if (!name || !loginId || !employeeNo) {
            return NextResponse.json({ error: "名前、ログインID、職員番号は必須です" }, { status: 400 });
        }

        // Check if loginId is taken by another user
        const existingLoginId = await prisma.staff.findFirst({
            where: { loginId, id: { not: staffId } },
        });
        if (existingLoginId) {
            return NextResponse.json({ error: "このログインIDは既に使用されています" }, { status: 400 });
        }

        const updateData: any = {
            name,
            loginId,
            email: email || null,
            employeeNo,
            employmentType,
            jobTitle: jobTitle || null,
            assignedClass: assignedClass || null,
            role,
            defaultStart,
            defaultEnd,
            standardWorkHours: standardWorkHours ? parseFloat(standardWorkHours) : undefined,
            breakTimeHours: breakTimeHours !== undefined ? parseFloat(breakTimeHours) : undefined,
            breakThresholdHours: breakThresholdHours !== undefined ? parseFloat(breakThresholdHours) : undefined,
            joinDate: joinDate || null,
            weeklyWorkDays: weeklyWorkDays ? parseInt(weeklyWorkDays) : undefined,
            weeklyWorkHours: weeklyWorkHours ? parseFloat(weeklyWorkHours) : undefined,
            maternityLeaveStart: maternityLeaveStart || null,
            maternityLeaveEnd: maternityLeaveEnd || null,
            childcareLeaveStart: childcareLeaveStart || null,
            childcareLeaveEnd: childcareLeaveEnd || null,
            expectedReturnDate: expectedReturnDate || null,
            status: status || undefined,
        };

        if (password && password.trim() !== "") {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        const updatedStaff = await prisma.staff.update({
            where: { id: staffId, orgId: session.orgId },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            staff: {
                id: updatedStaff.id,
                name: updatedStaff.name,
                loginId: updatedStaff.loginId,
                email: updatedStaff.email,
                employeeNo: updatedStaff.employeeNo,
                employmentType: updatedStaff.employmentType,
                jobTitle: updatedStaff.jobTitle,
                assignedClass: updatedStaff.assignedClass,
                role: updatedStaff.role,
                defaultStart: updatedStaff.defaultStart,
                defaultEnd: updatedStaff.defaultEnd,
                joinDate: updatedStaff.joinDate,
                breakTimeHours: updatedStaff.breakTimeHours,
                breakThresholdHours: updatedStaff.breakThresholdHours,
                weeklyWorkDays: updatedStaff.weeklyWorkDays,
                weeklyWorkHours: updatedStaff.weeklyWorkHours,
                maternityLeaveStart: updatedStaff.maternityLeaveStart,
                maternityLeaveEnd: updatedStaff.maternityLeaveEnd,
                childcareLeaveStart: updatedStaff.childcareLeaveStart,
                childcareLeaveEnd: updatedStaff.childcareLeaveEnd,
                expectedReturnDate: updatedStaff.expectedReturnDate,
                status: updatedStaff.status,
            }
        });

    } catch (error) {
        console.error("Staff update error:", error);
        return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) return NextResponse.json({ error: "未認証" }, { status: 401 });
        const session = JSON.parse(sessionCookie.value);

        if (session.role !== "ADMIN") return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });

        const resolvedParams = await params;
        const staffId = resolvedParams.id;

        // 連動して関連テーブル（Attendance等）のデータも物理削除される（schemaの cascade delete に依存）
        await prisma.staff.delete({
            where: { id: staffId, orgId: session.orgId },
        });

        return NextResponse.json({ success: true, message: "職員データを完全に削除しました" });

    } catch (error: any) {
        console.error("Staff full deletion error:", error.message || error);
        return NextResponse.json({ error: "削除処理に失敗しました。関連データが残っている可能性があります。" }, { status: 500 });
    }
}
