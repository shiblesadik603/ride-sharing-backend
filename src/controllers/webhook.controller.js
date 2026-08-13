import { stripe } from "../config/stripe.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import * as paymentService from "../services/payment.service.js";

/**
 * Not behind `authenticate` — Stripe calls this directly, and a JWT makes
 * no sense for a server-to-server webhook. The signature check below is
 * the authentication: it proves the request body actually came from
 * Stripe (signed with a secret only Stripe and this server know), not an
 * attacker POSTing a fake "payment succeeded" event.
 */
export async function stripeWebhook(req, res) {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ received: false, message: "Stripe is not configured" });
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", { error: err.message });
    return res.status(400).json({ received: false, message: `Webhook Error: ${err.message}` });
  }

  await paymentService.handleStripeEvent(event);
  res.status(200).json({ received: true });
}
