import Stripe from "stripe";
import { env } from "./env.js";

/**
 * `null` when unconfigured — Stripe's SDK validates the key's format at
 * construction time, so `new Stripe(undefined)` throws immediately rather
 * than failing lazily on first use. Every call site checks for `null` and
 * raises a clear "not configured" error instead, the same pattern as
 * `config/mailer.js`.
 */
// No timeout configured previously meant the SDK's own default (80s)
// governed how long a hung Stripe call could hold an Express request (and
// whatever DB connection/transaction it's mid-way through) open. 10s is
// generous for a payment-intent/refund call under normal conditions while
// still failing fast enough that a genuinely stuck request doesn't tie up
// a worker/connection for over a minute. `maxNetworkRetries` gives brief
// network blips (not the same as a request timeout) a couple of automatic
// retries using Stripe's own idempotency-safe retry logic before giving up.
export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { timeout: 10_000, maxNetworkRetries: 2 })
  : null;
