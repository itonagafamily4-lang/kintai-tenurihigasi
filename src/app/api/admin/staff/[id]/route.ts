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
            weeklyWorkDays, weeklyWorkHours, maternityLeaveStart, maternityLeaveEnd, childcareLeaveStart, childcareLeaveEnd, expectedReturnDate
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
            joinDate: joinDate || null,
            weeklyWorkDays: weeklyWorkDays ? parseInt(weeklyWorkDays) : undefined,
            weeklyWorkHours: weeklyWorkHours ? parseFloat(weeklyWorkHours) : undefined,
            maternityLeaveStart: maternityLeaveStart || null,
            maternityLeaveEnd: maternityLeaveEnd || null,
            childcareLeaveStart: childcareLeaveStart || null,
            childcareLeaveEnd: childcareLeaveEnd || null,
            expectedReturnDate: expectedReturnDate || null,
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
                weeklyWorkDays: updatedStaff.weeklyWorkDays,
                weeklyWorkHours: updatedStaff.weeklyWorkHours,
                maternityLeaveStart: updatedStaff.maternityLeaveStart,
                maternityLeaveEnd: updatedStaff.maternityLeaveEnd,
                childcareLeaveStart: updatedStaff.childcareLeaveStart,
                childcareLeaveEnd: updatedStaff.childcareLeaveEnd,
                expectedReturnDate: updatedStaff.expectedReturnDate,
            }
        });

    } catch (error) {
        console.error("Staff update error:", error);
        return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }
}
