import { Router } from "express";
import express from "express";
import * as webhookController from "../controllers/webhook.controller.js";

const router = Router();

// Stripe signs the raw request bytes, so this route needs the untouched
// body — mounted in app.js before the global express.json() parser runs,
// with its own express.raw() applied only here.
router.post("/stripe", express.raw({ type: "application/json" }), webhookController.stripeWebhook);

export default router;
