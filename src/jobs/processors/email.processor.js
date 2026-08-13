import { Worker } from "bullmq";
import { transporter } from "../../config/mailer.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { queueConnection } from "../../config/queue.js";
import { QUEUE_NAMES } from "../queues.js";
import * as notificationRepository from "../../repositories/notification.repository.js";

async function sendEmail({ to, subject, html }) {
  if (!transporter) {
    logger.info(`[email:dev] would send "${subject}" to ${to}`, { html });
    return;
  }
  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html });
}

export function createEmailWorker() {
  const worker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      const { notificationId, to, subject, html } = job.data;
      await sendEmail({ to, subject, html });
      if (notificationId) await notificationRepository.markSent(notificationId);
    },
    { connection: queueConnection }
  );

  worker.on("completed", (job) => {
    logger.debug("Email job completed", { jobId: job.id, to: job.data.to });
  });

  // BullMQ retries automatically while attempts remain, so this handler
  // can fire before the job is truly out of retries — the attemptsMade
  // check is what distinguishes "will try again" from "actually gave up",
  // and only the latter should mark the notification (and stop the user
  // waiting on an email that's never coming).
  worker.on("failed", async (job, err) => {
    const exhausted = (job?.attemptsMade ?? 0) >= (job?.opts?.attempts ?? 1);
    logger.error("Email job failed", {
      jobId: job?.id,
      to: job?.data?.to,
      attemptsMade: job?.attemptsMade,
      willRetry: !exhausted,
      error: err.message,
    });
    if (exhausted && job?.data?.notificationId) {
      await notificationRepository.markFailed(job.data.notificationId);
    }
  });

  return worker;
}
