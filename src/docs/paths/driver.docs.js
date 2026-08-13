import { z } from "zod";
import { registry, jsonBody, successResponse, standardErrors, bearerAuth } from "../registry.js";
import { goOnlineSchema, locationPingSchema } from "../../validators/driver.validator.js";

function driverRoute(config) {
  registry.registerPath({ tags: ["Drivers"], security: bearerAuth, ...config });
}

driverRoute({
  method: "post",
  path: "/api/v1/drivers/me/online",
  summary: "Go online",
  description: "Requires verificationStatus=APPROVED and at least one active, verified vehicle. Registers position in Redis Geo.",
  request: jsonBody(goOnlineSchema.shape.body),
  responses: { 200: successResponse(z.object({ isOnline: z.boolean() })), ...standardErrors(400, 401, 403) },
});

driverRoute({
  method: "post",
  path: "/api/v1/drivers/me/offline",
  summary: "Go offline",
  responses: { 200: successResponse(z.object({ isOnline: z.boolean() })), ...standardErrors(401, 403) },
});

driverRoute({
  method: "post",
  path: "/api/v1/drivers/me/location",
  summary: "Report current location",
  description:
    "REST fallback for the driver:location socket event — same underlying write, including the live broadcast to an active ride's passenger, if one exists.",
  request: jsonBody(locationPingSchema.shape.body),
  responses: { 200: successResponse(z.null()), ...standardErrors(400, 401, 403) },
});
