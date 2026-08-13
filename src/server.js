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
    await initJobs();
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

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });
  throw reason instanceof Error ? reason : new Error(String(reason));
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

start();
