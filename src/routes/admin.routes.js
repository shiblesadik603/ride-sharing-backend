import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { listUsersQuerySchema, updateUserStatusSchema, idParamSchema } from "../validators/user.validator.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/users", validate(listUsersQuerySchema), adminController.listUsers);
router.get("/users/:id", validate(idParamSchema), adminController.getUserById);
router.patch(
  "/users/:id/status",
  validate(updateUserStatusSchema),
  adminController.updateUserStatus
);

export default router;
