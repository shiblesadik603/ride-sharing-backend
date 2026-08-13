import { z } from "zod";
import { registry, successResponse } from "../registry.js";

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Liveness/readiness probe",
  description: "Checks that Postgres and Redis are actually reachable, not just that the process is running.",
  responses: {
    200: successResponse(
      z.object({
        uptime: z.number(),
        services: z.object({ database: z.enum(["up", "down"]), redis: z.enum(["up", "down"]) }),
      }),
      "Healthy"
    ),
    503: successResponse(z.unknown(), "Degraded — one or both dependencies unreachable"),
  },
});
