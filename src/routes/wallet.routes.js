import { Router } from "express";
import * as walletController from "../controllers/wallet.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { topUpSchema, walletHistoryQuerySchema } from "../validators/wallet.validator.js";

const router = Router();

router.use(authenticate);

router.get("/me", validate(walletHistoryQuerySchema), walletController.getMyWallet);
router.post("/me/topup", validate(topUpSchema), walletController.topUp);

export default router;
