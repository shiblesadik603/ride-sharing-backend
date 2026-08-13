import { Queue } from "bullmq";
import { queueConnection } from "../config/queue.js";

export const QUEUE_NAMES = {
  EMAIL: "email",
  MAINTENANCE: "maintenance",
  REPORT: "report",
};

/**
 * Shared default job options: 3 attempts with exponential backoff is
 * BullMQ's built-in answer to "retry failed notifications" — a transient
 * SMTP hiccup gets retried automatically instead of silently dropping the
 * email, without any hand-rolled retry loop in application code.
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
  connection: queueConnection,
  defaultJobOptions,
});

export const maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, {
  connection: queueConnection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 }, // idempotent cleanup, no need to retry
});

export const reportQueue = new Queue(QUEUE_NAMES.REPORT, {
  connection: queueConnection,
  defaultJobOptions,
});
