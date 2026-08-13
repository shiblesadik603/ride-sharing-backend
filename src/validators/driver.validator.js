import { z } from "zod";

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export const goOnlineSchema = z.object({
  body: z.object({ lat, lng }),
});

export const locationPingSchema = z.object({
  body: z.object({ lat, lng }),
});
