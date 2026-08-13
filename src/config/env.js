import "dotenv/config";
import { z } from "zod";

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
