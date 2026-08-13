import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import * as verificationController from "../controllers/verification.controller.js";
import * as adminPaymentController from "../controllers/adminPayment.controller.js";
import * as couponController from "../controllers/coupon.controller.js";
import * as walletController from "../controllers/wallet.controller.js";
import * as adminReportController from "../controllers/adminReport.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { listUsersQuerySchema, updateUserStatusSchema, idParamSchema } from "../validators/user.validator.js";
import {
  listDriversQuerySchema,
  reviewDriverSchema,
  reviewVehicleSchema,
  reviewDocumentSchema,
} from "../validators/vehicle.validator.js";
import { listPaymentsQuerySchema, refundPaymentSchema } from "../validators/payment.validator.js";
import {
  createCouponSchema,
  updateCouponSchema,
  listCouponsQuerySchema,
} from "../validators/coupon.validator.js";
import { adjustWalletSchema } from "../validators/wallet.validator.js";
import { reportRangeQuerySchema } from "../validators/report.validator.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/users", validate(listUsersQuerySchema), adminController.listUsers);
router.get("/users/:id", validate(idParamSchema), adminController.getUserById);
router.patch(
  "/users/:id/status",
  validate(updateUserStatusSchema),
  adminController.updateUserStatus
);

router.get("/drivers", validate(listDriversQuerySchema), verificationController.listDrivers);
router.get("/drivers/:id", validate(idParamSchema), verificationController.getDriver);
router.patch(
  "/drivers/:id/verification",
  validate(reviewDriverSchema),
  verificationController.reviewDriver
);

router.patch(
  "/vehicles/:id/verification",
  validate(reviewVehicleSchema),
  verificationController.reviewVehicle
);

router.patch(
  "/vehicle-documents/:id/review",
  validate(reviewDocumentSchema),
  verificationController.reviewDocument
);
router.get(
  "/vehicle-documents/:id/file",
  validate(idParamSchema),
  verificationController.downloadDocument
);

router.get("/payments", validate(listPaymentsQuerySchema), adminPaymentController.listPayments);
router.get("/payments/:id", validate(idParamSchema), adminPaymentController.getPayment);
router.post(
  "/payments/:id/refund",
  validate(refundPaymentSchema),
  adminPaymentController.refundPayment
);

router.get("/coupons", validate(listCouponsQuerySchema), couponController.list);
router.post("/coupons", validate(createCouponSchema), couponController.create);
router.patch("/coupons/:id", validate(updateCouponSchema), couponController.update);

router.post(
  "/wallets/:userId/adjust",
  validate(adjustWalletSchema),
  walletController.adjustBalance
);

router.get("/reports/summary", validate(reportRangeQuerySchema), adminReportController.getSummary);
router.post(
  "/reports/summary/send",
  validate(reportRangeQuerySchema),
  adminReportController.sendSummary
);

export default router;
