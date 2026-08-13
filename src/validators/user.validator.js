import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

const coordSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      firstName: z.string().trim().min(1).max(50),
      lastName: z.string().trim().min(1).max(50),
      phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format"),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, "At least one field is required"),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
  }),
});

export const becomeDriverSchema = z.object({
  body: z.object({
    licenseNumber: z.string().trim().min(1).max(50),
    licenseExpiry: z.coerce
      .date()
      .refine((d) => d > new Date(), "License expiry must be in the future"),
  }),
});

export const createSavedLocationSchema = z.object({
  body: z
    .object({
      label: z.string().trim().min(1).max(50),
      address: z.string().trim().min(1).max(255),
      isFavorite: z.boolean().default(false),
    })
    .extend(coordSchema.shape),
});

export const updateSavedLocationSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      label: z.string().trim().min(1).max(50),
      address: z.string().trim().min(1).max(255),
      isFavorite: z.boolean(),
    })
    .extend({ lat: coordSchema.shape.lat.optional(), lng: coordSchema.shape.lng.optional() })
    .partial()
    .refine((data) => Object.keys(data).length > 0, "At least one field is required"),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const addFavoriteDriverSchema = z.object({
  body: z.object({
    driverId: z.string().min(1),
  }),
});

export const removeFavoriteDriverSchema = z.object({
  params: z.object({ driverId: z.string().min(1) }),
});

export const listUsersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    role: z.enum(["PASSENGER", "DRIVER", "ADMIN"]).optional(),
    isActive: z.coerce.boolean().optional(),
    search: z.string().trim().min(1).max(100).optional(),
  }),
});

export const updateUserStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    isActive: z.boolean(),
  }),
});
