import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import * as verificationController from "../controllers/verification.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { listUsersQuerySchema, updateUserStatusSchema, idParamSchema } from "../validators/user.validator.js";
import {
  listDriversQuerySchema,
  reviewDriverSchema,
  reviewVehicleSchema,
  reviewDocumentSchema,
} from "../validators/vehicle.validator.js";

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

export default router;
