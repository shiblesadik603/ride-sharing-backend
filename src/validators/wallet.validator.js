import { z } from "zod";

export const topUpSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(),
  }),
});

export const walletHistoryQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const adjustWalletSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
  body: z.object({
    amount: z.coerce.number().refine((v) => v !== 0, "Amount cannot be zero"),
    reason: z.string().trim().min(1).max(255),
  }),
});
