import { z } from "zod";
import { idParamSchema, booleanQueryParam } from "./common.validator.js";

export { idParamSchema };

const percentageCap = (data, ctx) => {
  if (data.discountType === "PERCENTAGE" && Number(data.discountValue) > 100) {
    ctx.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "A percentage discount cannot exceed 100",
    });
  }
};

export const createCouponSchema = z.object({
  body: z
    .object({
      code: z.string().trim().toUpperCase().min(3).max(30),
      description: z.string().trim().max(255).optional(),
      discountType: z.enum(["PERCENTAGE", "FIXED"]),
      discountValue: z.coerce.number().positive(),
      maxDiscount: z.coerce.number().positive().optional(),
      minRideFare: z.coerce.number().positive().optional(),
      usageLimit: z.coerce.number().int().positive().optional(),
      usagePerUser: z.coerce.number().int().positive().default(1),
      validFrom: z.coerce.date(),
      validTo: z.coerce.date(),
    })
    .refine((d) => d.validTo > d.validFrom, {
      message: "validTo must be after validFrom",
      path: ["validTo"],
    })
    .superRefine(percentageCap),
});

export const updateCouponSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      description: z.string().trim().max(255),
      discountValue: z.coerce.number().positive(),
      maxDiscount: z.coerce.number().positive(),
      minRideFare: z.coerce.number().positive(),
      usageLimit: z.coerce.number().int().positive(),
      usagePerUser: z.coerce.number().int().positive(),
      validFrom: z.coerce.date(),
      validTo: z.coerce.date(),
      isActive: z.boolean(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, "At least one field is required"),
});

export const listCouponsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    isActive: booleanQueryParam.optional(),
  }),
});
