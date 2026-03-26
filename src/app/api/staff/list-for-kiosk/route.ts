import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        const staffList = await prisma.staff.findMany({
            where: { isActive: true, status: { not: "RETIRED" } },
            select: {
                id: true,
                name: true,
                employmentType: true,
            },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ success: true, staff: staffList });
    } catch (error) {
        console.error('Kiosk staff list error:', error);
        return NextResponse.json(
            { error: '職員リストの取得に失敗しました' },
            { status: 500 }
        );
    }
}
