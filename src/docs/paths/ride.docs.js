import { z } from "zod";
import { registry, jsonBody, successResponse, standardErrors, bearerAuth } from "../registry.js";
import {
  requestRideSchema,
  nearbyQuerySchema,
  rideHistoryQuerySchema,
  startRideSchema,
  cancelRideSchema,
  idParamSchema,
} from "../../validators/ride.validator.js";
import { payRideSchema } from "../../validators/payment.validator.js";
import { submitRatingSchema } from "../../validators/rating.validator.js";

const rideSchema = registry.register(
  "Ride",
  z.object({
    id: z.string(),
    passengerId: z.string(),
    driverId: z.string().nullable(),
    vehicleId: z.string().nullable(),
    status: z.enum(["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
    requestedVehicleType: z.enum(["BIKE", "AUTO", "SEDAN", "SUV", "HATCHBACK"]),
    pickupAddress: z.string(),
    pickupLat: z.number(),
    pickupLng: z.number(),
    dropoffAddress: z.string(),
    dropoffLat: z.number(),
    dropoffLng: z.number(),
    distanceMeters: z.number().nullable(),
    durationSeconds: z.number().nullable(),
    otpCode: z.string().optional().openapi({
      description: "Present only when the caller is the passenger — never sent to the driver",
    }),
    estimatedFare: z.string(),
    actualFare: z.string().nullable(),
    currency: z.string(),
    requestedAt: z.string().datetime(),
  })
);

const paymentSchema = registry.register(
  "Payment",
  z.object({
    id: z.string(),
    rideId: z.string(),
    payerId: z.string(),
    amount: z.string(),
    currency: z.string(),
    method: z.enum(["CARD", "WALLET", "CASH"]),
    provider: z.enum(["STRIPE", "WALLET", "CASH"]),
    status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]),
  })
);

const ratingSchema = registry.register(
  "Rating",
  z.object({
    id: z.string(),
    rideId: z.string(),
    raterId: z.string(),
    rateeId: z.string(),
    direction: z.enum(["PASSENGER_TO_DRIVER", "DRIVER_TO_PASSENGER"]),
    value: z.number().min(1).max(5),
    comment: z.string().nullable(),
  })
);

function rideRoute(config) {
  registry.registerPath({ tags: ["Rides"], security: bearerAuth, ...config });
}

rideRoute({
  method: "get",
  path: "/api/v1/rides/history",
  summary: "Your own ride history (passenger)",
  request: { query: rideHistoryQuerySchema.shape.query },
  responses: {
    200: successResponse(z.object({ rides: z.array(rideSchema), pagination: z.unknown() })),
    ...standardErrors(401, 403),
  },
});

rideRoute({
  method: "get",
  path: "/api/v1/rides/driver-history",
  summary: "Your own ride history (driver)",
  description: "OTP is always stripped from these results, regardless of ride status.",
  request: { query: rideHistoryQuerySchema.shape.query },
  responses: {
    200: successResponse(z.object({ rides: z.array(rideSchema), pagination: z.unknown() })),
    ...standardErrors(401, 403),
  },
});

rideRoute({
  method: "get",
  path: "/api/v1/rides/nearby",
  summary: "Pending ride requests near your current position (driver)",
  description:
    "Redis Geo search, not a Postgres scan. Excludes rides you've already rejected and rides whose vehicle type you can't serve.",
  request: { query: nearbyQuerySchema.shape.query },
  responses: { 200: successResponse(z.array(rideSchema)), ...standardErrors(401, 403) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides",
  summary: "Request a ride (passenger)",
  description: "Computes route/fare (Google Directions, or a Haversine estimate if unconfigured), generates the OTP, and dispatches to nearby online drivers over Socket.IO.",
  request: jsonBody(requestRideSchema.shape.body),
  responses: { 201: successResponse(rideSchema), ...standardErrors(400, 401, 403, 409) },
});

rideRoute({
  method: "get",
  path: "/api/v1/rides/{id}",
  summary: "Get a ride you're a participant in",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(rideSchema), ...standardErrors(401, 404) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/accept",
  summary: "Accept a pending ride (driver)",
  description: "Race-safe: a single conditional UPDATE ensures exactly one of any competing drivers wins.",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(rideSchema), ...standardErrors(400, 401, 403, 409) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/reject",
  summary: "Decline an offered ride (driver)",
  description: "Removes this ride from your own nearby results only — other drivers are unaffected.",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(z.null()), ...standardErrors(401, 403) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/arrived",
  summary: "Mark arrival at the pickup point (driver)",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(rideSchema), ...standardErrors(401, 403, 404, 409) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/start",
  summary: "Start the ride with the passenger's OTP (driver)",
  description: "Capped at 5 attempts per 15 minutes — see the Rides guide for why.",
  request: { params: startRideSchema.shape.params, body: jsonBody(startRideSchema.shape.body).body },
  responses: { 200: successResponse(rideSchema), ...standardErrors(400, 401, 403, 404, 409) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/complete",
  summary: "Complete the ride (driver)",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(rideSchema), ...standardErrors(401, 403, 404, 409) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/cancel",
  summary: "Cancel a ride (passenger or driver)",
  description: "Only while REQUESTED, ACCEPTED, or ARRIVED.",
  request: { params: cancelRideSchema.shape.params, body: jsonBody(cancelRideSchema.shape.body).body },
  responses: { 200: successResponse(rideSchema), ...standardErrors(401, 404, 409) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/pay",
  summary: "Pay for a completed ride (passenger)",
  description: "CARD returns a Stripe clientSecret for client-side confirmation. WALLET/CASH complete immediately.",
  request: { params: payRideSchema.shape.params, body: jsonBody(payRideSchema.shape.body).body },
  responses: {
    201: successResponse(z.object({ payment: paymentSchema, clientSecret: z.string().optional() })),
    ...standardErrors(400, 401, 404, 409),
  },
});

rideRoute({
  method: "get",
  path: "/api/v1/rides/{id}/payment",
  summary: "View payment + refund history for a ride",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(paymentSchema), ...standardErrors(401, 404) },
});

rideRoute({
  method: "post",
  path: "/api/v1/rides/{id}/rating",
  summary: "Rate the other party on a completed ride",
  description: "Direction (passenger-to-driver or vice versa) is inferred from who's calling, never accepted as input. One rating per direction per ride.",
  request: { params: submitRatingSchema.shape.params, body: jsonBody(submitRatingSchema.shape.body).body },
  responses: { 201: successResponse(ratingSchema), ...standardErrors(400, 401, 404, 409) },
});

rideRoute({
  method: "get",
  path: "/api/v1/rides/{id}/ratings",
  summary: "View both directions' ratings for a ride",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(z.array(ratingSchema)), ...standardErrors(401, 404) },
});

export { rideSchema, paymentSchema, ratingSchema };
