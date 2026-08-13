import { z } from "zod";

export const trendsQuerySchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    interval: z.enum(["day", "week", "month"]).default("day"),
  }),
});

export const topDriversQuerySchema = z.object({
  query: z.object({
    by: z.enum(["earnings", "rides", "rating"]).default("earnings"),
    limit: z.coerce.number().int().positive().max(50).default(10),
  }),
});
