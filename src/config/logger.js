import winston from "winston";
import { env, isProduction } from "./env.js";

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

/**
 * Every current call site was audited and found clean (no log call passes
 * a password, token, or raw request body) — but that's a property of
 * today's code, not something enforced anywhere. This is the enforcement:
 * a future `logger.info("...", { ...req.body })` or a metadata object
 * that happens to include a `passwordHash`/`refreshToken` field still gets
 * masked before it ever reaches a transport, recursively, so it doesn't
 * matter how deeply nested the sensitive field is. Matches by key name,
 * not by value shape — cheap, and doesn't need to know what a JWT or a
 * bcrypt hash looks like to catch it.
 */
const SENSITIVE_KEY_PATTERN =
  /password|passwordHash|token|otp|otpCode|secret|authorization|cardNumber|cvv|stripeSecretKey/i;
const REDACTED = "[REDACTED]";

function redact(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  // `Error#stack` (and, depending on how the error was constructed,
  // sometimes `#message`) is frequently a non-enumerable property —
  // `Object.entries()` silently skips those, so passing an Error through
  // the generic object branch below reconstructs it as `{}`, discarding
  // exactly the information anyone logging an error actually wants. Found
  // this the hard way: a genuine crash's `logger.error("...", { reason })`
  // rendered as `{"reason":{}}`, which made the real bug (an unhandled
  // Redis rejection, unrelated to logging) much harder to diagnose than
  // it needed to be. Pulling `message`/`stack`/`name` out explicitly
  // — they're never sensitive — fixes both this class of bug and, as a
  // side effect, means the sensitive-key redaction below still runs over
  // an error's *other* own enumerable properties (an ApiError's
  // `.details`, for instance) via the normal object path.
  if (value instanceof Error) {
    const { message, stack, name, ...rest } = value;
    return { name, message, stack, ...redact(rest, seen) };
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val, seen);
    }
    return out;
  }

  return value;
}

// Mutates `info` in place rather than returning a freshly-built object —
// Winston's `info` carries Symbol-keyed internal bookkeeping (level
// formatting, splat args) alongside its string-keyed properties, and a
// plain `{ ...spread }` reconstruction silently drops those symbols,
// which later format steps (colorize, in particular) depend on. `level`
// and `message` are always strings, never worth redacting, and skipped
// so they're never even checked against the pattern.
const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === "level" || key === "message") continue;
    info[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(info[key]);
  }
  return info;
})();

const devFormat = combine(
  redactFormat,
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${ts} ${level}: ${stack || message}${metaStr}`;
  })
);

// Structured JSON in production so log aggregators (CloudWatch, Datadog,
// Loki, etc.) can index fields instead of parsing free-text lines.
const prodFormat = combine(redactFormat, timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});
