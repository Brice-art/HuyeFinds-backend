import { PrismaClient } from "@prisma/client";

// ts-node-dev restarts the process on file changes but can leave the old
// module cache around in some setups; a global singleton avoids opening a
// fresh pool of DB connections on every reload (a real gotcha with Neon's
// low connection ceiling on the free tier).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
