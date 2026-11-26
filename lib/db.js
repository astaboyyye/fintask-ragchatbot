import { PrismaClient } from "@prisma/client";

// Reuse one PrismaClient across hot reloads in dev and across warm serverless
// invocations, so we don't exhaust database connections.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

export default prisma;
