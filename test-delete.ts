import { prisma } from "./src/lib/db";
async function main() {
    try {
        await prisma.staff.delete({ where: { id: "3bfddffb-ea10-4ac2-996c-d719bf63a09e" } });
        console.log("Success");
    } catch(e) {
        console.error("Error:", e);
    }
}
main();
