import { z } from "zod";
import { registry, jsonBody, successResponse, standardErrors, bearerAuth } from "../registry.js";
import { userSchema } from "./auth.docs.js";
import { vehicleSchema, vehicleDocumentSchema } from "./vehicle.docs.js";
import { paymentSchema } from "./ride.docs.js";
import { walletSchema } from "./wallet.docs.js";
import { listUsersQuerySchema, updateUserStatusSchema, idParamSchema } from "../../validators/user.validator.js";
import {
  listDriversQuerySchema,
  reviewDriverSchema,
  reviewVehicleSchema,
  reviewDocumentSchema,
} from "../../validators/vehicle.validator.js";
import { listPaymentsQuerySchema, refundPaymentSchema } from "../../validators/payment.validator.js";
import { createCouponSchema, updateCouponSchema, listCouponsQuerySchema } from "../../validators/coupon.validator.js";
import { adjustWalletSchema } from "../../validators/wallet.validator.js";
import { reportRangeQuerySchema } from "../../validators/report.validator.js";
import { trendsQuerySchema, topDriversQuerySchema } from "../../validators/analytics.validator.js";

const driverSchema = registry.register(
  "Driver",
  z.object({
    id: z.string(),
    userId: z.string(),
    licenseNumber: z.string(),
    verificationStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]),
    isOnline: z.boolean(),
    averageRating: z.string(),
    totalRides: z.number(),
    totalEarnings: z.string(),
  })
);

const couponSchema = registry.register(
  "Coupon",
  z.object({
    id: z.string(),
    code: z.string(),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    discountValue: z.string(),
    maxDiscount: z.string().nullable(),
    usageLimit: z.number().nullable(),
    usagePerUser: z.number(),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime(),
    isActive: z.boolean(),
  })
);

const ADMIN_NOTE = "Requires role: ADMIN.";

/** ADMIN-only note is meaningful documentation (authorize() gates every
 * one of these routes at runtime) — not boilerplate to trim. */
function adminRoute(config) {
  registry.registerPath({
    tags: ["Admin"],
    security: bearerAuth,
    description: config.description ? `${config.description} ${ADMIN_NOTE}` : ADMIN_NOTE,
    ...config,
  });
}

// -- Users --------------------------------------------------------------

adminRoute({
  method: "get",
  path: "/api/v1/admin/users",
  summary: "List users",
  request: { query: listUsersQuerySchema.shape.query },
  responses: {
    200: successResponse(z.object({ users: z.array(userSchema), pagination: z.unknown() })),
    ...standardErrors(401, 403),
  },
});

adminRoute({
  method: "get",
  path: "/api/v1/admin/users/{id}",
  summary: "Get a user's full profile",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(userSchema), ...standardErrors(401, 403, 404) },
});

adminRoute({
  method: "patch",
  path: "/api/v1/admin/users/{id}/status",
  summary: "Activate or deactivate a user",
  description: "Deactivation revokes every session for that user. Admin accounts cannot be deactivated here.",
  request: {
    params: updateUserStatusSchema.shape.params,
    body: jsonBody(updateUserStatusSchema.shape.body).body,
  },
  responses: { 200: successResponse(userSchema), ...standardErrors(400, 401, 403, 404) },
});

// -- Driver / vehicle / document verification ----------------------------

adminRoute({
  method: "get",
  path: "/api/v1/admin/drivers",
  summary: "List drivers",
  request: { query: listDriversQuerySchema.shape.query },
  responses: {
    200: successResponse(z.object({ drivers: z.array(driverSchema), pagination: z.unknown() })),
    ...standardErrors(401, 403),
  },
});

adminRoute({
  method: "get",
  path: "/api/v1/admin/drivers/{id}",
  summary: "Get a driver's full detail (identity, vehicles, documents)",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(driverSchema), ...standardErrors(401, 403, 404) },
});

adminRoute({
  method: "patch",
  path: "/api/v1/admin/drivers/{id}/verification",
  summary: "Approve, reject, or suspend a driver",
  description: "Sends the driver an email notification with the decision.",
  request: {
    params: reviewDriverSchema.shape.params,
    body: jsonBody(reviewDriverSchema.shape.body).body,
  },
  responses: { 200: successResponse(driverSchema), ...standardErrors(400, 401, 403, 404) },
});

adminRoute({
  method: "patch",
  path: "/api/v1/admin/vehicles/{id}/verification",
  summary: "Approve or unapprove a vehicle",
  request: {
    params: reviewVehicleSchema.shape.params,
    body: jsonBody(reviewVehicleSchema.shape.body).body,
  },
  responses: { 200: successResponse(vehicleSchema), ...standardErrors(400, 401, 403, 404) },
});

adminRoute({
  method: "patch",
  path: "/api/v1/admin/vehicle-documents/{id}/review",
  summary: "Approve or reject a vehicle document",
  request: {
    params: reviewDocumentSchema.shape.params,
    body: jsonBody(reviewDocumentSchema.shape.body).body,
  },
  responses: { 200: successResponse(vehicleDocumentSchema), ...standardErrors(400, 401, 403, 404) },
});

adminRoute({
  method: "get",
  path: "/api/v1/admin/vehicle-documents/{id}/file",
  summary: "Download any vehicle document for review",
  request: { params: idParamSchema.shape.params },
  responses: { 200: { description: "The raw file (PDF/JPEG/PNG)" }, ...standardErrors(401, 403, 404) },
});

// -- Payments & refunds ---------------------------------------------------

adminRoute({
  method: "get",
  path: "/api/v1/admin/payments",
  summary: "List payments",
  request: { query: listPaymentsQuerySchema.shape.query },
  responses: {
    200: successResponse(z.object({ payments: z.array(paymentSchema), pagination: z.unknown() })),
    ...standardErrors(401, 403),
  },
});

adminRoute({
  method: "get",
  path: "/api/v1/admin/payments/{id}",
  summary: "Get a payment's full detail, including refunds",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(paymentSchema), ...standardErrors(401, 403, 404) },
});

adminRoute({
  method: "post",
  path: "/api/v1/admin/payments/{id}/refund",
  summary: "Refund a payment, fully or partially",
  description:
    "STRIPE payments refund through Stripe; WALLET/CASH payments credit the payer's wallet instead — the only channel available to push money back ourselves.",
  request: {
    params: refundPaymentSchema.shape.params,
    body: jsonBody(refundPaymentSchema.shape.body).body,
  },
  responses: {
    200: successResponse(z.object({ payment: paymentSchema, refund: z.unknown() })),
    ...standardErrors(400, 401, 403, 404, 409),
  },
});

// -- Coupons ---------------------------------------------------------------

adminRoute({
  method: "get",
  path: "/api/v1/admin/coupons",
  summary: "List coupons",
  request: { query: listCouponsQuerySchema.shape.query },
  responses: {
    200: successResponse(z.object({ coupons: z.array(couponSchema), pagination: z.unknown() })),
    ...standardErrors(401, 403),
  },
});

adminRoute({
  method: "post",
  path: "/api/v1/admin/coupons",
  summary: "Create a coupon",
  request: jsonBody(createCouponSchema.shape.body),
  responses: { 201: successResponse(couponSchema), ...standardErrors(400, 401, 403, 409) },
});

adminRoute({
  method: "patch",
  path: "/api/v1/admin/coupons/{id}",
  summary: "Update a coupon",
  description: "code is immutable after creation — not among the editable fields.",
  request: { params: updateCouponSchema.shape.params, body: jsonBody(updateCouponSchema.shape.body).body },
  responses: { 200: successResponse(couponSchema), ...standardErrors(400, 401, 403, 404) },
});

// -- Wallet adjustment ------------------------------------------------------

adminRoute({
  method: "post",
  path: "/api/v1/admin/wallets/{userId}/adjust",
  summary: "Credit or debit a user's wallet",
  description: "Signed amount — positive credits, negative debits (race-safe, same guard as ride payments).",
  request: { params: adjustWalletSchema.shape.params, body: jsonBody(adjustWalletSchema.shape.body).body },
  responses: { 200: successResponse(walletSchema), ...standardErrors(400, 401, 403, 404) },
});

// -- Reports -----------------------------------------------------------------

adminRoute({
  method: "get",
  path: "/api/v1/admin/reports/summary",
  summary: "Compute an ops summary (rides, revenue, signups)",
  description: "Defaults to the last 24 hours if from/to are omitted. Read-only — does not send email.",
  request: { query: reportRangeQuerySchema.shape.query },
  responses: { 200: successResponse(z.unknown()), ...standardErrors(401, 403) },
});

adminRoute({
  method: "post",
  path: "/api/v1/admin/reports/summary/send",
  summary: "Compute an ops summary and email it to every active admin",
  request: { query: reportRangeQuerySchema.shape.query },
  responses: { 200: successResponse(z.unknown()), ...standardErrors(401, 403) },
});

// -- Dashboard & analytics ----------------------------------------------------

adminRoute({
  method: "get",
  path: "/api/v1/admin/dashboard",
  summary: "Live snapshot: users, drivers, vehicles, rides, revenue, payments",
  responses: { 200: successResponse(z.unknown()), ...standardErrors(401, 403) },
});

adminRoute({
  method: "get",
  path: "/api/v1/admin/analytics/rides",
  summary: "Ride volume/completion/cancellation trends, time-bucketed",
  request: { query: trendsQuerySchema.shape.query },
  responses: { 200: successResponse(z.unknown()), ...standardErrors(400, 401, 403) },
});

adminRoute({
  method: "get",
  path: "/api/v1/admin/analytics/revenue",
  summary: "Revenue trends, time-bucketed",
  request: { query: trendsQuerySchema.shape.query },
  responses: { 200: successResponse(z.unknown()), ...standardErrors(400, 401, 403) },
});

adminRoute({
  method: "get",
  path: "/api/v1/admin/analytics/top-drivers",
  summary: "Leaderboard by earnings, ride count, or rating",
  description: "rating excludes drivers with zero completed rides.",
  request: { query: topDriversQuerySchema.shape.query },
  responses: { 200: successResponse(z.array(driverSchema)), ...standardErrors(400, 401, 403) },
});
