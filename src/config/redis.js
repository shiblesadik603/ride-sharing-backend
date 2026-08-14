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

// A Node EventEmitter with zero listeners for an "error" event doesn't
// just log-and-continue — it throws, which crashes the entire process if
// nothing catches it. `redisSubscriber` never had one: a Redis outage
// didn't degrade Socket.IO's cross-instance broadcasting, it took down
// the whole server, HTTP API included, every route, every in-flight
// request. Confirmed the hard way — stopping the local Redis service
// during testing crashed the process outright, not just the socket
// layer, which is what surfaced this in the first place.
redisSubscriber.on("connect", () => logger.info("Redis subscriber connected"));
redisSubscriber.on("error", (err) => logger.error("Redis subscriber error", { error: err.message }));
