import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Two separate connections by convention: `redis` for normal
 * get/set/geo/cache commands, `redisSubscriber` for Pub/Sub. A client that
 * issues SUBSCRIBE is put into subscriber mode by Redis and can no longer
 * run regular commands on the same connection, so Socket.IO cross-instance
 * broadcasting (Phase: Real-Time) needs its own connection.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

export const redisSubscriber = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error("Redis error", { error: err.message }));
