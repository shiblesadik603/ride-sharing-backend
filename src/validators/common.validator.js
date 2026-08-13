import { z } from "zod";

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

/**
 * `z.coerce.boolean()` on a query string is a trap: it runs `Boolean(str)`,
 * and `Boolean("false")` is `true` — any non-empty string is truthy, so
 * `?isActive=false` silently coerces to `true`. This parses the literal
 * "true"/"false" text instead. Found live: `?isRead=false` was filtering
 * for read notifications, the opposite of what it asked for.
 */
export const booleanQueryParam = z.enum(["true", "false"]).transform((v) => v === "true");
