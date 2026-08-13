import IORedis from "ioredis";
import { env } from "./env.js";

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
