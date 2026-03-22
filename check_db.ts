import { prisma } from './src/lib/db';
async function main() {
    const staffs = await prisma.staff.findMany();
    console.log(staffs.map(s => ({ id: s.id, name: s.name, email: s.email, loginId: s.loginId })));
}
main();
