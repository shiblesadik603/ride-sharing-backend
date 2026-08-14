import IORedis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * BullMQ's blocking commands (BRPOPLPUSH etc.) require a connection with
 * `maxRetriesPerRequest: null` — our main `redis` client (config/redis.js)
 * is deliberately configured with a retry cap for regular request/response
 * commands, so it can't be reused here without weakening that guarantee
 * for everything else that shares it. A dedicated connection keeps the
 * two use cases from fighting over incompatible settings.
 */
export const queueConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Same reasoning as redisSubscriber in config/redis.js: an ioredis client
// with no "error" listener crashes the whole Node process on a connection
// error, not just this queue connection specifically — confirmed live by
// actually stopping Redis during testing and watching the server die.
// BullMQ's own internal reconnect logic handles transient errors on its
// own; this handler exists purely so an error event always has *some*
// listener, converting "process crashes" into "this gets logged and
// ioredis's own reconnection strategy takes over," which is the behavior
// this connection was always supposed to have.
queueConnection.on("error", (err) => logger.error("BullMQ Redis connection error", { error: err.message }));
