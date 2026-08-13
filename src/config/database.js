import { PrismaClient } from "@prisma/client";
import { env, isProduction } from "./env.js";
import { logger } from "./logger.js";

/**
 * Single shared Prisma client for the process. In dev, Node's module cache
 * combined with nodemon restarts can otherwise spawn a new client (and a
 * new connection pool) on every file change — stash it on `global` so hot
 * reloads reuse the same instance.
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction
      ? [{ emit: "event", level: "error" }]
      : [
          { emit: "event", level: "query" },
          { emit: "event", level: "error" },
          { emit: "event", level: "warn" },
        ],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
  prisma.$on("query", (e) => {
    logger.debug(`${e.query} [${e.params}] (${e.duration}ms)`);
  });
}

prisma.$on("error", (e) => {
  logger.error("Prisma error", { error: e.message });
});

export async function connectDatabase() {
  await prisma.$connect();
  logger.info("PostgreSQL connected via Prisma");
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info("PostgreSQL disconnected");
}
