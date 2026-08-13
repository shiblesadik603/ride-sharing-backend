import { z } from "zod";
import { idParamSchema, booleanQueryParam } from "./common.validator.js";

export { idParamSchema };

export const listNotificationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    isRead: booleanQueryParam.optional(),
  }),
});
