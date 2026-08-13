import { z } from "zod";
import { idParamSchema } from "./common.validator.js";

export { idParamSchema };

export const submitRatingSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    value: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
  }),
});

export const myRatingsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});
