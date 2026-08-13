import { Router } from "express";
import * as driverController from "../controllers/driver.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { goOnlineSchema, locationPingSchema } from "../validators/driver.validator.js";

const router = Router();

router.use(authenticate);

router.post("/me/online", validate(goOnlineSchema), driverController.goOnline);
router.post("/me/offline", driverController.goOffline);
router.post("/me/location", validate(locationPingSchema), driverController.updateLocation);

export default router;
