import { Router } from "express";
import * as rideController from "../controllers/ride.controller.js";
import * as paymentController from "../controllers/payment.controller.js";
import * as ratingController from "../controllers/rating.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  requestRideSchema,
  nearbyQuerySchema,
  rideHistoryQuerySchema,
  startRideSchema,
  cancelRideSchema,
  idParamSchema,
} from "../validators/ride.validator.js";
import { payRideSchema } from "../validators/payment.validator.js";
import { submitRatingSchema } from "../validators/rating.validator.js";

const router = Router();

router.use(authenticate);

// Static-path routes must be registered before `/:id`, or Express would
// try to match "history"/"nearby" as the :id param instead.
router.get("/history", validate(rideHistoryQuerySchema), rideController.history);
router.get("/driver-history", validate(rideHistoryQuerySchema), rideController.driverHistory);
router.get("/nearby", validate(nearbyQuerySchema), rideController.nearby);

router.post("/", validate(requestRideSchema), rideController.request);
router.get("/:id", validate(idParamSchema), rideController.get);

router.post("/:id/accept", validate(idParamSchema), rideController.accept);
router.post("/:id/reject", validate(idParamSchema), rideController.reject);
router.post("/:id/arrived", validate(idParamSchema), rideController.arrived);
router.post("/:id/start", validate(startRideSchema), rideController.start);
router.post("/:id/complete", validate(idParamSchema), rideController.complete);
router.post("/:id/cancel", validate(cancelRideSchema), rideController.cancel);

router.post("/:id/pay", validate(payRideSchema), paymentController.pay);
router.get("/:id/payment", validate(idParamSchema), paymentController.getForRide);

router.post("/:id/rating", validate(submitRatingSchema), ratingController.submit);
router.get("/:id/ratings", validate(idParamSchema), ratingController.getForRide);

export default router;
