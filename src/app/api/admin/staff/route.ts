import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import * as bcrypt from "bcryptjs";
import { getFiscalYear } from "@/lib/engine/calculator";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);
        console.log(`[Staff GET] OrgId: ${session.orgId}, Role: ${session.role}`);
        
        if (session.role !== "ADMIN") {
            return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
        }

        const staff = await (prisma.staff.findMany({
            where: { orgId: session.orgId, isActive: true, status: { not: "RETIRED" } },
            select: {
                id: true,
                status: true,
                employeeNo: true,
                name: true,
                loginId: true,
                email: true,
                joinDate: true,
                employmentType: true,
                jobTitle: true,
                assignedClass: true,
                role: true,
                defaultStart: true,
                defaultEnd: true,
                standardWorkHours: true,
                breakTimeHours: true,
                breakThresholdHours: true,
                weeklyWorkDays: true,
                weeklyWorkHours: true,
                maternityLeaveStart: true,
                maternityLeaveEnd: true,
                childcareLeaveStart: true,
                childcareLeaveEnd: true,
                expectedReturnDate: true,
                leaveBalances: {
                    select: {
                        fiscalYear: true,
                        grantedDays: true,
                        usedDays: true,
                        remainingDays: true,
                    },
                    orderBy: { fiscalYear: "desc" },
                    take: 1,
                },
            },
        }) as any);

        // 職員番号を数値として考慮してソート (SQLiteの文字列ソートを補正)
        staff.sort((a: any, b: any) => {
            const numA = parseInt(a.employeeNo, 10);
            const numB = parseInt(b.employeeNo, 10);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.employeeNo.localeCompare(b.employeeNo, undefined, { numeric: true });
        });

        return NextResponse.json({ staff });
    } catch (error: any) {
        console.error("Staff API error:", error);
        return NextResponse.json({ error: `サーバーエラー: ${error.message || error}` }, { status: 500 });
    }
}

// 新しい職員を追加
export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        if (!sessionCookie) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);
        if (session.role !== "ADMIN") {
            return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
        }

        const body = await req.json();
        const {
            name, email, loginId, employeeNo, employmentType, jobTitle, assignedClass, role,
            defaultStart, defaultEnd, standardWorkHours, password, joinDate,
            weeklyWorkDays, weeklyWorkHours, maternityLeaveStart, maternityLeaveEnd, childcareLeaveStart, childcareLeaveEnd, expectedReturnDate,
            breakTimeHours, breakThresholdHours
        } = body;

        // バリデーション
        if (!name || !loginId || !employeeNo) {
            return NextResponse.json({ error: "名前、ログインID、職員番号は必須です" }, { status: 400 });
        }

        const validTypes = ["REGULAR", "SHORT_TIME", "PART_TIME"];
        if (employmentType && !validTypes.includes(employmentType)) {
            return NextResponse.json({ error: "無効な雇用形態です" }, { status: 400 });
        }

        // ログインIDの重複チェック
        const existingLoginId = await prisma.staff.findFirst({
            where: { loginId },
        });
        if (existingLoginId) {
            return NextResponse.json({ error: "このログインIDは既に使用されています" }, { status: 400 });
        }

        // 職員番号の重複チェック
        const existingNo = await prisma.staff.findFirst({
            where: { employeeNo, orgId: session.orgId },
        });
        if (existingNo) {
            return NextResponse.json({ error: "この職員番号は既に使用されています" }, { status: 400 });
        }

        // パスワードハッシュ（デフォルトは "password123"）
        const passwordHash = await bcrypt.hash(password || "password123", 10);

        // 職員作成
        const newStaff = await prisma.staff.create({
            data: {
                orgId: session.orgId,
                name,
                loginId,
                email: email || null,
                joinDate: joinDate || null,
                employeeNo,
                employmentType: employmentType || "REGULAR",
                jobTitle: jobTitle || null,
                assignedClass: assignedClass || null,
                role: role || "STAFF",
                defaultStart: defaultStart || "08:30",
                defaultEnd: defaultEnd || "17:30",
                standardWorkHours: standardWorkHours ? parseFloat(standardWorkHours) : 8.0,
                breakTimeHours: breakTimeHours ? parseFloat(breakTimeHours) : 0.75,
                breakThresholdHours: breakThresholdHours ? parseFloat(breakThresholdHours) : 6.0,
                weeklyWorkDays: weeklyWorkDays ? parseInt(weeklyWorkDays) : 5,
                weeklyWorkHours: weeklyWorkHours ? parseFloat(weeklyWorkHours) : 40.0,
                maternityLeaveStart: maternityLeaveStart || null,
                maternityLeaveEnd: maternityLeaveEnd || null,
                childcareLeaveStart: childcareLeaveStart || null,
                childcareLeaveEnd: childcareLeaveEnd || null,
                expectedReturnDate: expectedReturnDate || null,
                isActive: true,
                status: "ACTIVE",
                passwordHash,
            },
        });

        // 有休残高を自動作成
        const fiscalYear = getFiscalYear(new Date());
        const totalDays = (employmentType || "REGULAR") === "PART_TIME" ? 10 : 20;

        await prisma.leaveBalance.create({
            data: {
                staffId: newStaff.id,
                fiscalYear,
                grantedDays: totalDays,
                carriedOverDays: 0,
                totalDays,
                usedDays: 0,
                remainingDays: totalDays,
            },
        });

        return NextResponse.json({
            success: true,
            staff: {
                id: newStaff.id,
                name: newStaff.name,
                loginId: newStaff.loginId,
                email: newStaff.email,
                employeeNo: newStaff.employeeNo,
                employmentType: newStaff.employmentType,
                role: newStaff.role,
            },
            message: `${name}さんを登録しました`,
        });
    } catch (error) {
        console.error("Staff create error:", error);
        return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
    }
}

