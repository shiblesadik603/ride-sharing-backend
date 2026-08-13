import rateLimit from "express-rate-limit";

/**
 * Endpoint-specific limiters, tighter than the app-wide baseline in
 * app.js. Credential-guessing and email-bombing are the two threats that
 * matter enough here to warrant their own budget instead of sharing the
 * generous global limit with every other route.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: "Too many attempts. Try again later." },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: "Too many requests. Try again later." },
});
