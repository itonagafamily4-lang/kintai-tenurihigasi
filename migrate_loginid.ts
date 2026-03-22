import { prisma } from './src/lib/db';
async function main() {
    const staffs = await prisma.staff.findMany();
    for (const staff of staffs) {
        if (!staff.loginId && staff.email) {
            await prisma.staff.update({
                where: { id: staff.id },
                data: { loginId: staff.email },
            });
        }
    }
    console.log("Migration complete!");
}
main();
