/**
 * Standalone entry point for running background jobs as their own
 * process/container — no HTTP server, no Socket.IO. Resolves the
 * limitation flagged back in Phase 9 ("job workers run in the same
 * process as the HTTP server ... a production deployment handling
 * meaningful job volume would typically run these as a separate
 * process"): every processor in jobs/processors/ already only depended
 * on queueConnection and the database, never on Express, so splitting
 * this out required no changes to the jobs themselves — only this file.
 *
 * Run with `node src/worker.js`, or as the `worker` service in
 * docker-compose.yml, alongside an `app` service running with
 * ENABLE_JOBS=false so the same jobs aren't processed by both.
 */
import { logger } from "./config/logger.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { redis, redisSubscriber } from "./config/redis.js";
import { queueConnection } from "./config/queue.js";
import { initJobs, closeJobs } from "./jobs/index.js";

async function start() {
  try {
    await connectDatabase();
    await initJobs();
    logger.info("Worker process ready");
  } catch (err) {
    logger.error("Failed to start worker", { error: err.message });
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down worker gracefully`);
  await closeJobs();
  await disconnectDatabase();
  redis.disconnect();
  redisSubscriber.disconnect();
  queueConnection.disconnect();
  logger.info("Worker shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection in worker", { reason });
  throw reason instanceof Error ? reason : new Error(String(reason));
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception in worker", { error: err.message, stack: err.stack });
  process.exit(1);
});

start();
