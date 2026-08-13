import { logger } from "../config/logger.js";
import { createEmailWorker } from "./processors/email.processor.js";
import { createCleanupWorker } from "./processors/cleanup.processor.js";
import { createReportWorker } from "./processors/report.processor.js";
import { scheduleRepeatableJobs } from "./scheduler.js";

let workers = [];

/**
 * Workers run in-process alongside the HTTP server — appropriate at this
 * project's scale. A production deployment handling meaningful job volume
 * would typically run these as a separate process/deployment (so a burst
 * of email jobs can't starve the API of event-loop time, and so each can
 * scale independently), but that's an infra decision, not a code change:
 * every processor here already only depends on `queueConnection` and the
 * database, not on anything Express-specific.
 */
export async function initJobs() {
  workers = [createEmailWorker(), createCleanupWorker(), createReportWorker()];
  await scheduleRepeatableJobs();
  logger.info("Background job workers started");
  return workers;
}

export async function closeJobs() {
  await Promise.all(workers.map((worker) => worker.close()));
}
