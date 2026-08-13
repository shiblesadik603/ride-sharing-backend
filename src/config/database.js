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
const isNewClient = !globalForPrisma.prisma;

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

// Guarded by `isNewClient`, not just `!isProduction`: this module can be
// freshly re-evaluated (a test runner giving each file its own module
// registry, a hot reload) while `globalForPrisma.prisma` — and therefore
// the underlying client's event emitter — persists across that. Without
// the guard, every re-evaluation attaches another "query" listener to the
// same long-lived client, so by the Nth file every query gets logged N
// times. Subscribing only once, at actual creation, is what "reuse across
// reloads" was supposed to mean in the first place.
if (!isProduction && isNewClient) {
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
