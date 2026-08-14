import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { redis, redisSubscriber } from "./config/redis.js";
import { queueConnection } from "./config/queue.js";
import { initSockets } from "./sockets/index.js";
import { initJobs, closeJobs } from "./jobs/index.js";

const server = http.createServer(app);

// Socket.IO attaches to this same `server` instance — ride/location events
// share the HTTP server rather than standing up a second port.
initSockets(server);

async function start() {
  try {
    await connectDatabase();
    // ENABLE_JOBS=false when a dedicated `worker` process (src/worker.js)
    // handles the queues instead — running both would mean every job gets
    // picked up by whichever process's Worker happens to poll first,
    // silently doubling side effects like sent emails.
    if (env.ENABLE_JOBS) await initJobs();
    server.listen(env.PORT, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  }
}

/**
 * Graceful shutdown: stop accepting new connections, let in-flight
 * requests finish, then close the DB/Redis connections. A hard `process.exit`
 * on SIGTERM mid-request would drop active rides/payments mid-write.
 */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await closeJobs();
    await disconnectDatabase();
    redis.disconnect();
    redisSubscriber.disconnect();
    queueConnection.disconnect();
    logger.info("Shutdown complete");
    process.exit(0);
  });

  // Safety net in case connections hang.
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

/**
 * ioredis rejects in-flight command promises when a connection drops and
 * its retry budget (`maxRetriesPerRequest`) is exhausted — that rejection
 * originates deep inside ioredis's own reconnect bookkeeping, on whichever
 * specific command happened to be in flight at the time, not from any
 * call site this codebase controls or could wrap in try/catch. Every
 * *service-level* Redis call this app makes has already been made
 * resilient to Redis being down (geo.service.js's withRedisFallback,
 * auth.service.js's login-lockout guards, the error listeners in
 * config/redis.js and config/queue.js) — this is the leftover noise from
 * ioredis's internals during exactly that same scenario, not a sign
 * anything is actually broken. Confirmed live: stopping Redis during
 * testing produced exactly this class of rejection and nothing else,
 * and the app's own Redis-touching code kept degrading correctly around it.
 *
 * A genuinely unknown/unexpected unhandled rejection — the entire reason
 * this handler exists — still crashes the process. This is a narrow,
 * named exception for one specific, already-understood, already-handled
 * failure mode, not a general "ignore unhandled rejections" policy.
 */
const KNOWN_TRANSIENT_REDIS_ERRORS = new Set([
  "MaxRetriesPerRequestError",
  "ConnectionError",
  "ClusterAllFailedError",
]);

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });

  if (reason instanceof Error && KNOWN_TRANSIENT_REDIS_ERRORS.has(reason.name)) {
    return;
  }

  throw reason instanceof Error ? reason : new Error(String(reason));
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

start();
