import Stripe from "stripe";
import { env } from "./env.js";

/**
 * `null` when unconfigured — Stripe's SDK validates the key's format at
 * construction time, so `new Stripe(undefined)` throws immediately rather
 * than failing lazily on first use. Every call site checks for `null` and
 * raises a clear "not configured" error instead, the same pattern as
 * `config/mailer.js`.
 */
export const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
