import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = global as unknown as {
    authPrisma: PrismaClient;
};

const authPrisma =
    globalForPrisma.authPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.authPrisma = authPrisma;

export default authPrisma;
