
import { prisma } from './src/lib/db';

async function test() {
  try {
    console.log("Testing schedule creation...");
    const created = await prisma.schedule.create({
      data: {
        orgId: "test-org",
        date: "2026-03-27",
        title: "Test Event",
        isWorkOverride: false,
        targetType: "ALL"
      }
    });
    console.log("Created:", created);

    console.log("Testing findUnique...");
    const found = await prisma.schedule.findUnique({
      where: { id: created.id }
    });
    console.log("Found:", found);

    if (!found) throw new Error("Could not find created schedule");

    console.log("Testing update...");
    const updated = await prisma.schedule.update({
      where: { id: created.id },
      data: { title: "Updated Event" }
    });
    console.log("Updated:", updated);

    console.log("Testing delete...");
    await prisma.schedule.delete({
      where: { id: created.id }
    });
    console.log("Deleted successfully");

  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
