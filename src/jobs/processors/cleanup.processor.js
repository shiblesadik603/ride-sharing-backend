import { Worker } from "bullmq";
import { logger } from "../../config/logger.js";
import { queueConnection } from "../../config/queue.js";
import { QUEUE_NAMES } from "../queues.js";
import * as tokenRepository from "../../repositories/token.repository.js";
import * as rideService from "../../services/ride.service.js";
import * as driverService from "../../services/driver.service.js";

export function createCleanupWorker() {
  const worker = new Worker(
    QUEUE_NAMES.MAINTENANCE,
    async (job) => {
      if (job.name === "expired-tokens") {
        const [refreshTokens, verificationTokens] = await Promise.all([
          tokenRepository.deleteExpiredRefreshTokens(),
          tokenRepository.deleteExpiredVerificationTokens(),
        ]);

        logger.info("Expired token cleanup completed", { refreshTokens, verificationTokens });
        return { refreshTokens, verificationTokens };
      }

      if (job.name === "expire-stale-rides") {
        const result = await rideService.expireStaleRides();
        if (result.expiredCount > 0) {
          logger.info("Stale ride expiry completed", result);
        }
        return result;
      }

      if (job.name === "expire-stale-driver-heartbeats") {
        const result = await driverService.expireStaleHeartbeats();
        if (result.expiredCount > 0) {
          logger.info("Stale driver heartbeat sweep completed", result);
        }
        return result;
      }
    },
    // Explicit rather than relying on BullMQ's default — this queue's work
    // is pure DB/Redis queries with no external network call in the mix,
    // so 30s is already generous; making it explicit documents that it's
    // a deliberate choice, not an unexamined default.
    { connection: queueConnection, lockDuration: 30_000 }
  );

  worker.on("failed", (job, err) => {
    logger.error("Cleanup job failed", { jobId: job?.id, error: err.message });
  });

  return worker;
}
