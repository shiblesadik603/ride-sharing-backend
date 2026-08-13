import { z } from "zod";
import { idParamSchema } from "./common.validator.js";

export { idParamSchema };

const VEHICLE_TYPES = ["BIKE", "AUTO", "SEDAN", "SUV", "HATCHBACK"];
const RIDE_STATUSES = ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export const requestRideSchema = z.object({
  body: z
    .object({
      pickupAddress: z.string().trim().min(1).max(255),
      pickupLat: lat,
      pickupLng: lng,
      dropoffAddress: z.string().trim().min(1).max(255),
      dropoffLat: lat,
      dropoffLng: lng,
      requestedVehicleType: z.enum(VEHICLE_TYPES),
    })
    .refine(
      (d) => Math.abs(d.pickupLat - d.dropoffLat) > 1e-5 || Math.abs(d.pickupLng - d.dropoffLng) > 1e-5,
      { message: "Pickup and dropoff cannot be the same location", path: ["dropoffLat"] }
    ),
});

export const nearbyQuerySchema = z.object({
  query: z.object({
    lat,
    lng,
    radiusKm: z.coerce.number().positive().max(50).default(5),
  }),
});

export const rideHistoryQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(RIDE_STATUSES).optional(),
  }),
});

export const startRideSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    otpCode: z.string().regex(/^\d{4}$/, "OTP must be a 4-digit code"),
  }),
});

export const cancelRideSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    reason: z.string().trim().min(1).max(255).optional(),
  }),
});
