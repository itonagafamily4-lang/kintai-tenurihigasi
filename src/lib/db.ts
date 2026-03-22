import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// DBファイルはプロジェクトルート直下の dev.db
const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });

function createPrismaClient() {
    return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
    prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
// Last updated: 2026-03-13T22:20:00 (Reload nudge)
