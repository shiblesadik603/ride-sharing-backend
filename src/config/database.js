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

// Every query, at debug level, is the right amount of noise for local
// dev (freely visible, freely ignored) but far too much for production
// log volume/cost — the previous production config skipped `query`
// events entirely, which meant a genuinely slow query was invisible
// until it was already causing a user-facing problem. Subscribing in
// both environments and filtering by duration in the handler gets
// production visibility into slow queries specifically, without paying
// for logging every fast one.
const SLOW_QUERY_THRESHOLD_MS = 200;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
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
if (isNewClient) {
  globalForPrisma.prisma = prisma;
  prisma.$on("query", (e) => {
    if (!isProduction) {
      logger.debug(`${e.query} [${e.params}] (${e.duration}ms)`);
    } else if (e.duration >= SLOW_QUERY_THRESHOLD_MS) {
      // Deliberately omits `e.params` — those are positional bind values
      // with no field names attached, so the key-based redaction in
      // config/logger.js can't tell a plain filter value from a bcrypt
      // hash or a hashed refresh/verification token bound as a parameter
      // (e.g. any query touching passwordHash/tokenHash columns). The
      // query text alone identifies which query was slow; reproducing it
      // with real values, if ever needed, is a job for the requestId
      // correlating this log line to the request that triggered it, not
      // for logging the raw parameters.
      logger.warn("Slow query", { query: e.query, durationMs: e.duration });
    }
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
