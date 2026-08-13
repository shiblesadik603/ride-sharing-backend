import { logger } from "../config/logger.js";
import { maintenanceQueue, reportQueue } from "./queues.js";

/**
 * BullMQ v6 moved repeatable jobs to a dedicated "Job Scheduler" API —
 * passing `{repeat: {pattern}}` straight to `.add()` (the pre-v6 idiom)
 * silently stops being a repeat config in v6 and just runs once
 * immediately instead, which is exactly the surprise that showed up while
 * testing this: both jobs fired on the very first server boot. This is
 * the actual v6-correct call, `upsertJobScheduler`, and it's idempotent
 * by design (`jobSchedulerId` identifies the schedule) — safe to call on
 * every startup without creating duplicate cron entries.
 */
export async function scheduleRepeatableJobs() {
  await maintenanceQueue.upsertJobScheduler(
    "expired-tokens-cleanup",
    { pattern: "0 3 * * *" }, // daily 3am
    { name: "expired-tokens" }
  );
  await reportQueue.upsertJobScheduler(
    "daily-ops-summary",
    { pattern: "0 6 * * *" }, // daily 6am
    { name: "daily-summary" }
  );

  logger.info("Scheduled repeatable jobs registered");
}
