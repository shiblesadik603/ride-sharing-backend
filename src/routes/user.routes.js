import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import * as ratingController from "../controllers/rating.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  updateProfileSchema,
  changePasswordSchema,
  becomeDriverSchema,
  createSavedLocationSchema,
  updateSavedLocationSchema,
  idParamSchema,
  addFavoriteDriverSchema,
  removeFavoriteDriverSchema,
} from "../validators/user.validator.js";
import { myRatingsQuerySchema } from "../validators/rating.validator.js";

const router = Router();

router.use(authenticate);

router.get("/me", userController.getMe);
router.patch("/me", validate(updateProfileSchema), userController.updateMe);
router.post("/me/change-password", validate(changePasswordSchema), userController.changePassword);
router.post("/me/become-driver", validate(becomeDriverSchema), userController.becomeDriver);

router.get("/me/saved-locations", userController.listSavedLocations);
router.post(
  "/me/saved-locations",
  validate(createSavedLocationSchema),
  userController.createSavedLocation
);
router.patch(
  "/me/saved-locations/:id",
  validate(updateSavedLocationSchema),
  userController.updateSavedLocation
);
router.delete(
  "/me/saved-locations/:id",
  validate(idParamSchema),
  userController.deleteSavedLocation
);

router.get("/me/favorite-drivers", userController.listFavoriteDrivers);
router.post(
  "/me/favorite-drivers",
  validate(addFavoriteDriverSchema),
  userController.addFavoriteDriver
);
router.delete(
  "/me/favorite-drivers/:driverId",
  validate(removeFavoriteDriverSchema),
  userController.removeFavoriteDriver
);

router.get("/me/ratings", validate(myRatingsQuerySchema), ratingController.myReceived);

export default router;
