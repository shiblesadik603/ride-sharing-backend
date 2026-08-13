import { Worker } from "bullmq";
import { logger } from "../../config/logger.js";
import { queueConnection } from "../../config/queue.js";
import { QUEUE_NAMES } from "../queues.js";
import * as tokenRepository from "../../repositories/token.repository.js";

export function createCleanupWorker() {
  const worker = new Worker(
    QUEUE_NAMES.MAINTENANCE,
    async (job) => {
      if (job.name !== "expired-tokens") return;

      const [refreshTokens, verificationTokens] = await Promise.all([
        tokenRepository.deleteExpiredRefreshTokens(),
        tokenRepository.deleteExpiredVerificationTokens(),
      ]);

      logger.info("Expired token cleanup completed", { refreshTokens, verificationTokens });
      return { refreshTokens, verificationTokens };
    },
    { connection: queueConnection }
  );

  worker.on("failed", (job, err) => {
    logger.error("Cleanup job failed", { jobId: job?.id, error: err.message });
  });

  return worker;
}
