// lib/auth.ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import authPrisma from '@/lib/auth-prisma';

export const auth = betterAuth({
  database: prismaAdapter(authPrisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      phone: {
        type: "string",
        required: false,
      },
    },
  },
  logger: {
    level: "debug",
    enabled: true,
  },
});