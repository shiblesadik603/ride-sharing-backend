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

      // A job can be redelivered after a crash between the send actually
      // completing and markSent() persisting that fact — BullMQ's
      // at-least-once delivery guarantee, not a bug in it. Without this
      // check, that redelivery would send the email a second time. The
      // Notification row's own status is the durable record of whether
      // this already happened; SENT/FAILED both mean "done," so only a
      // still-PENDING notification is actually sent.
      if (notificationId) {
        const notification = await notificationRepository.findById(notificationId);
        if (notification && notification.status !== "PENDING") {
          logger.debug("Skipping already-processed notification (redelivered job)", {
            notificationId,
            status: notification.status,
          });
          return;
        }
      }

      await sendEmail({ to, subject, html });
      if (notificationId) await notificationRepository.markSent(notificationId);
    },
    // Explicit rather than relying on BullMQ's default (also 30s): sized
    // against mailer.js's own SMTP timeouts (10s connect + 10s greeting +
    // 10s socket, worst case ~30s stacked) with headroom, so a
    // legitimately-still-sending job never loses its lock to another
    // worker mid-send — the actual failure mode a too-short lock would
    // risk is the same email getting sent twice by two workers racing on
    // the same job.
    { connection: queueConnection, lockDuration: 45_000 }
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
