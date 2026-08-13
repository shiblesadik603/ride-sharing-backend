import { z } from "zod";

export const payRideSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    method: z.enum(["CARD", "WALLET", "CASH"]),
    couponCode: z.string().trim().toUpperCase().min(1).optional(),
  }),
});

export const refundPaymentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    amount: z.coerce.number().positive().optional(),
    reason: z.string().trim().min(1).max(255),
  }),
});

export const listPaymentsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
  }),
});
