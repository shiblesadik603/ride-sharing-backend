import { Router } from "express";
import * as vehicleController from "../controllers/vehicle.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { requireOwnVehicle } from "../middlewares/vehicleOwnership.middleware.js";
import { uploadVehicleDocument } from "../middlewares/upload.middleware.js";
import {
  createVehicleSchema,
  updateVehicleSchema,
  uploadDocumentSchema,
  documentParamsSchema,
  idParamSchema,
} from "../validators/vehicle.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", vehicleController.list);
router.post("/", validate(createVehicleSchema), vehicleController.create);
router.get("/:id", validate(idParamSchema), vehicleController.get);
router.patch("/:id", validate(updateVehicleSchema), vehicleController.update);
router.delete("/:id", validate(idParamSchema), vehicleController.remove);

router.get("/:id/documents", validate(idParamSchema), vehicleController.listDocuments);
router.post(
  "/:id/documents",
  requireOwnVehicle,
  uploadVehicleDocument.single("document"),
  validate(uploadDocumentSchema),
  vehicleController.uploadDocument
);
router.get(
  "/:id/documents/:documentId/file",
  validate(documentParamsSchema),
  vehicleController.downloadDocument
);
router.delete(
  "/:id/documents/:documentId",
  validate(documentParamsSchema),
  vehicleController.removeDocument
);

export default router;
