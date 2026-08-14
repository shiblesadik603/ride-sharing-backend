import { Worker } from "bullmq";
import { logger } from "../../config/logger.js";
import { queueConnection } from "../../config/queue.js";
import { QUEUE_NAMES } from "../queues.js";
import * as reportService from "../../services/report.service.js";

export function createReportWorker() {
  const worker = new Worker(
    QUEUE_NAMES.REPORT,
    async (job) => {
      if (job.name !== "daily-summary") return;

      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      const summary = await reportService.generateAndEmailSummary({ from, to });
      logger.info("Daily summary report generated and emailed to admins", summary);
      return summary;
    },
    // Report generation is DB aggregation plus enqueueing an email job
    // (not sending one directly), so no SMTP-hang risk here — 30s is
    // ample; explicit for the same "documented, not accidental" reason as
    // the other two workers.
    { connection: queueConnection, lockDuration: 30_000 }
  );

  worker.on("failed", (job, err) => {
    logger.error("Report job failed", { jobId: job?.id, error: err.message });
  });

  return worker;
}
