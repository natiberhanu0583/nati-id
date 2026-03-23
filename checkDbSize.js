import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDbSize() {
    const result = await prisma.$queryRaw`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size;
  `;
    console.log("Database size:", result[0].size);
    await prisma.$disconnect();
}

checkDbSize();
