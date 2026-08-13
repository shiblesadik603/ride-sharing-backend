import dotenv from "dotenv";
import { z } from "zod";

// `NODE_ENV=test` (set by `npm test`) loads `.env.test` instead of `.env`,
// so the test suite always runs against the isolated test database and
// Redis logical DB configured there — never against whatever's sitting in
// a developer's local `.env` at the time.
//
// `override: true` in test mode only: found live while testing this phase
// — Jest's startup leaves stray values in `process.env` (e.g. LOG_LEVEL)
// ahead of this call running, and dotenv's default (don't clobber
// already-set vars) silently kept those instead of applying .env.test,
// making every test run depend on whatever pre-existing process state
// happened to be lying around. Tests must be hermetic, so .env.test always
// wins here. Dev intentionally keeps the opposite default — a developer
// temporarily exporting a var to override `.env` without editing it is a
// normal workflow worth preserving.
const isTestEnv = process.env.NODE_ENV === "test";
dotenv.config({ path: isTestEnv ? ".env.test" : ".env", override: isTestEnv, quiet: true });

/**
 * Fail fast: validate all required environment variables at process start
 * rather than discovering a missing secret when a request happens to hit
 * that code path in production.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  CORS_ORIGIN: z.string().default("*"),

  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Base URL of the frontend app — used to build links inside emails
  // (e.g. `${CLIENT_URL}/reset-password?token=...`). Also doubles as the
  // CORS allow-origin in single-frontend deployments.
  CLIENT_URL: z.string().url().default("http://localhost:3000"),

  // Audience claim Google's ID tokens are checked against. Get this from
  // Google Cloud Console > APIs & Services > Credentials.
  GOOGLE_CLIENT_ID: z.string().optional(),

  // SMTP is optional in development — when unset, the email service logs
  // the rendered email instead of sending it, so auth flows are runnable
  // locally without a mail provider account.
  SMTP_HOST: z.string().optional(),
  // An empty-string env var (unset in .env, e.g. `SMTP_PORT=`) must be
  // treated as "not provided", not coerced to the number 0.
  SMTP_PORT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("Ride Sharing <no-reply@ridesharing.local>"),

  // Optional — unset means route/distance/ETA fall back to a straight-line
  // (Haversine) estimate instead of calling the Google Directions API.
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Optional — unset means CARD payments and wallet top-ups are rejected
  // with a clear "not configured" error instead of crashing; WALLET and
  // CASH ride payments work fully without Stripe.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
