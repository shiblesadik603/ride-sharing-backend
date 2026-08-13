import { Router } from "express";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const router = Router();

/**
 * Liveness/readiness probe for load balancers and container orchestrators
 * (ECS, Kubernetes, Railway, Render). Checks that both hard dependencies
 * are actually reachable, not just that the Node process is running.
 */
router.get("/", async (req, res) => {
  const [dbHealthy, redisHealthy] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then(() => true).catch(() => false),
  ]);

  const healthy = dbHealthy && redisHealthy;

  res
    .status(healthy ? 200 : 503)
    .json(
      new ApiResponse(
        healthy ? 200 : 503,
        {
          uptime: process.uptime(),
          services: {
            database: dbHealthy ? "up" : "down",
            redis: redisHealthy ? "up" : "down",
          },
        },
        healthy ? "OK" : "Service degraded"
      )
    );
});

export default router;
