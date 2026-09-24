import { PrismaClient } from '@prisma/client';
export const prisma = globalThis.__pvPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__pvPrisma = prisma;
