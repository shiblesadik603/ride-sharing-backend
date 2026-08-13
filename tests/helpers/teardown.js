import { prisma } from "../../src/config/database.js";
import { redis, redisSubscriber } from "../../src/config/redis.js";
import { queueConnection } from "../../src/config/queue.js";
import { emailQueue, maintenanceQueue, reportQueue } from "../../src/jobs/queues.js";

/**
 * Importing `app.js` (for Supertest) transitively imports jobs/queues.js
 * (auth -> email.service -> notification.service -> queues), which
 * creates three BullMQ Queue instances. Each one duplicates its own Redis
 * connection internally rather than truly sharing `queueConnection` —
 * BullMQ requires this, since a single connection can't serve multiple
 * queues' blocking commands at once. Disconnecting only `queueConnection`
 * left those duplicated connections open, which was the actual cause of
 * `npm test` hanging past Jest's normal runtime instead of exiting.
 */
export async function closeAppConnections() {
  await Promise.all([emailQueue.close(), maintenanceQueue.close(), reportQueue.close()]);
  await prisma.$disconnect();
  redis.disconnect();
  redisSubscriber.disconnect();
  queueConnection.disconnect();
}
