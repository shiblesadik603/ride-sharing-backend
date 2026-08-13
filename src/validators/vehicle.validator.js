import { z } from "zod";
import { idParamSchema } from "./common.validator.js";

export { idParamSchema };

const VEHICLE_TYPES = ["BIKE", "AUTO", "SEDAN", "SUV", "HATCHBACK"];
const DOCUMENT_TYPES = ["REGISTRATION", "INSURANCE", "PERMIT", "POLLUTION_CERTIFICATE"];
const currentYear = new Date().getFullYear();

export const createVehicleSchema = z.object({
  body: z.object({
    type: z.enum(VEHICLE_TYPES),
    make: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(50),
    year: z.coerce.number().int().min(1980).max(currentYear + 1),
    color: z.string().trim().min(1).max(30),
    plateNumber: z.string().trim().min(1).max(20).toUpperCase(),
    capacity: z.coerce.number().int().min(1).max(8),
  }),
});

export const updateVehicleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      type: z.enum(VEHICLE_TYPES),
      make: z.string().trim().min(1).max(50),
      model: z.string().trim().min(1).max(50),
      year: z.coerce.number().int().min(1980).max(currentYear + 1),
      color: z.string().trim().min(1).max(30),
      plateNumber: z.string().trim().min(1).max(20).toUpperCase(),
      capacity: z.coerce.number().int().min(1).max(8),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, "At least one field is required"),
});

export const uploadDocumentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    type: z.enum(DOCUMENT_TYPES),
    expiryDate: z.coerce.date().optional(),
  }),
});

export const documentParamsSchema = z.object({
  params: z.object({ id: z.string().min(1), documentId: z.string().min(1) }),
});

export const reviewDocumentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
  }),
});

export const reviewVehicleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    isVerified: z.boolean(),
  }),
});

export const reviewDriverSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    verificationStatus: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
    reason: z.string().trim().min(1).max(500).optional(),
  }),
});

export const listDriversQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    verificationStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  }),
});
