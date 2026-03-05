import { PrismaClient } from "@/generated/prisma";

// This is a plain Prisma client WITHOUT the Accelerate extension.
// Better Auth's Prisma adapter is incompatible with extended Prisma clients.
const globalForPrisma = global as unknown as {
    authPrisma: PrismaClient;
};

const authPrisma =
    globalForPrisma.authPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.authPrisma = authPrisma;

export default authPrisma;
