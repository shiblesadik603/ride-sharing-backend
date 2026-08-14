import { z } from "zod";
import { registry, jsonBody, successResponse, standardErrors, bearerAuth } from "../registry.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  googleAuthSchema,
} from "../../validators/auth.validator.js";

const userSchema = registry.register(
  "User",
  z.object({
    id: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    avatarUrl: z.string().nullable(),
    role: z.enum(["PASSENGER", "DRIVER", "ADMIN"]),
    isEmailVerified: z.boolean(),
    isPhoneVerified: z.boolean(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
  })
);

const sessionSchema = registry.register(
  "Session",
  z.object({
    user: userSchema,
    accessToken: z.string().openapi({ description: "15-minute JWT, send as Authorization: Bearer <token>" }),
    refreshToken: z
      .string()
      .openapi({ description: "Also set as an httpOnly cookie for web clients — mobile clients use this field" }),
  })
);

const PASSWORD_POLICY_NOTE =
  "Password: 8-72 characters, at least one lowercase letter, one uppercase letter, and one number. " +
  "(OpenAPI's `pattern` can only express one regex; the schema below shows just the first of several checked at runtime.)";

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/register",
  tags: ["Auth"],
  summary: "Create a passenger account and start a session",
  description: PASSWORD_POLICY_NOTE,
  request: jsonBody(registerSchema.shape.body),
  responses: {
    201: successResponse(sessionSchema, "Registered — verification email queued"),
    ...standardErrors(400, 409),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/login",
  tags: ["Auth"],
  summary: "Log in with email + password",
  description: "Returns the same generic error for a wrong password as for a nonexistent email.",
  request: jsonBody(loginSchema.shape.body),
  responses: {
    200: successResponse(sessionSchema),
    ...standardErrors(400, 401, 403),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/google",
  tags: ["Auth"],
  summary: "Sign in with a Google ID token",
  description:
    "Verifies the ID token server-side; auto-creates or auto-links an account by Google-verified email. Requires GOOGLE_CLIENT_ID to be configured.",
  request: jsonBody(googleAuthSchema.shape.body),
  responses: {
    200: successResponse(sessionSchema),
    ...standardErrors(400, 401),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate a refresh token for a new access/refresh pair",
  description:
    "Reusing an already-rotated refresh token is treated as theft and revokes every session for that user.",
  request: jsonBody(refreshTokenSchema.shape.body, "Omit if sending the refreshToken cookie instead"),
  responses: {
    200: successResponse(z.object({ accessToken: z.string(), refreshToken: z.string() })),
    ...standardErrors(401),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/logout",
  tags: ["Auth"],
  summary: "Revoke the current session's refresh token",
  responses: { 200: successResponse(z.null()) },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/logout-all",
  tags: ["Auth"],
  security: bearerAuth,
  summary: "Revoke every session on every device for the current account",
  description:
    "Revokes all refresh tokens and immediately invalidates already-issued access tokens — the same mechanism a ban or password reset uses internally, exposed here for a user who suspects their own account is compromised or lost a device.",
  responses: { 200: successResponse(z.null()), ...standardErrors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/forgot-password",
  tags: ["Auth"],
  summary: "Request a password reset email",
  description: "Always responds identically whether or not the email is registered — prevents enumeration.",
  request: jsonBody(forgotPasswordSchema.shape.body),
  responses: { 200: successResponse(z.null()), ...standardErrors(400) },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/reset-password",
  tags: ["Auth"],
  summary: "Reset a password using an emailed token",
  description: `Revokes every existing session for the account on success. ${PASSWORD_POLICY_NOTE}`,
  request: jsonBody(resetPasswordSchema.shape.body),
  responses: { 200: successResponse(z.null()), ...standardErrors(400) },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/verify-email",
  tags: ["Auth"],
  summary: "Verify an email address using an emailed token",
  request: jsonBody(verifyEmailSchema.shape.body),
  responses: { 200: successResponse(z.null()), ...standardErrors(400) },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/resend-verification",
  tags: ["Auth"],
  summary: "Resend the email verification link",
  description: "Silent no-op if the account doesn't exist or is already verified.",
  request: jsonBody(resendVerificationSchema.shape.body),
  responses: { 200: successResponse(z.null()), ...standardErrors(400) },
});

export { userSchema, sessionSchema };
