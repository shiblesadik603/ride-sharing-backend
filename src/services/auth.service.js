import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { googleClient } from "../config/google.js";
import { logger } from "../config/logger.js";
import { redis } from "../config/redis.js";
import { ApiError } from "../utils/ApiError.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
import { hashToken, generateRandomToken } from "../utils/token.util.js";
import * as userRepository from "../repositories/user.repository.js";
import * as tokenRepository from "../repositories/token.repository.js";
import * as tokenService from "./token.service.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email.service.js";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * `loginLimiter` (rateLimit.middleware.js) is IP-keyed — it slows down one
 * source hammering /login, but does nothing against a distributed attacker
 * spreading guesses across many IPs at a single target account, or
 * multiple legitimate users behind one NAT/proxy IP getting throttled by
 * someone else's attempts. This is the per-account complement: failures
 * are counted against the *email being guessed*, regardless of source IP.
 */
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;

function failedLoginKey(email) {
  return `auth:failedLogin:${email.toLowerCase().trim()}`;
}

/**
 * Registration and login should never fail because notifying the user is
 * having a bad moment. Since email.service.js now only enqueues (actual
 * sending happens in the worker, with its own retries), this mainly
 * guards against the enqueue call itself failing — e.g. Redis briefly
 * unreachable — which is rarer than an SMTP failure used to be, but the
 * same principle applies: the account/token state is already committed,
 * so a notification hiccup is logged and swallowed, not surfaced to the user.
 */
async function safeSendEmail(sendFn, ...args) {
  try {
    await sendFn(...args);
  } catch (err) {
    logger.error("Failed to send email", { error: err.message });
  }
}

async function issueSession(user, meta) {
  const accessToken = tokenService.signAccessToken(user);
  const refreshToken = await tokenService.issueRefreshToken(user.id, meta);
  return { accessToken, refreshToken };
}

export async function register({ email, password, firstName, lastName, phone }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  const user = await userRepository.createPassengerAccount({
    email,
    passwordHash,
    firstName,
    lastName,
    phone,
    isEmailVerified: false,
  });

  const rawToken = generateRandomToken();
  await tokenRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    type: "EMAIL_VERIFICATION",
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });
  await safeSendEmail(sendVerificationEmail, user, rawToken);

  const session = await issueSession(user);
  return { user: sanitizeUser(user), ...session };
}

export async function login({ email, password, deviceInfo, ipAddress }) {
  const lockKey = failedLoginKey(email);

  // Checked before touching bcrypt at all — no point spending the hashing
  // cost on a request that's going to be rejected either way, and it keeps
  // the lockout itself cheap to enforce under an active attack.
  //
  // Both Redis calls in this function are wrapped: the lockout is a
  // defense-in-depth *enhancement* on top of password auth, not the
  // authentication itself — a Redis outage should degrade it (no lockout
  // enforced until Redis recovers), never take down login entirely. That
  // was a real gap: unwrapped, a Redis outage previously 500'd every
  // login attempt, which is a far worse outcome than a temporarily
  // unenforced brute-force guard.
  let attempts = 0;
  try {
    attempts = Number((await redis.get(lockKey)) ?? 0);
  } catch (err) {
    logger.warn("Login lockout check failed, proceeding without it", { error: err.message });
  }
  if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    throw ApiError.forbidden(
      "Too many failed login attempts for this account. Try again in a few minutes."
    );
  }

  const user = await userRepository.findByEmail(email);

  // Same generic message whether the email doesn't exist, the account is
  // Google-only (no passwordHash), or the password is wrong — anything more
  // specific tells an attacker which emails have accounts.
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    try {
      const count = await redis.incr(lockKey);
      if (count === 1) await redis.expire(lockKey, FAILED_LOGIN_WINDOW_SECONDS);
    } catch (err) {
      logger.warn("Failed to record failed login attempt", { error: err.message });
    }
    throw ApiError.unauthorized("Invalid email or password");
  }

  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  try {
    await redis.del(lockKey);
  } catch (err) {
    // A correct password was just verified — nothing here should be able
    // to block this login, including failing to clear a counter that (if
    // Redis is down) isn't being enforced anyway.
    logger.warn("Failed to clear login lockout counter", { error: err.message });
  }
  await userRepository.touchLastLogin(user.id);
  const session = await issueSession(user, { deviceInfo, ipAddress });
  return { user: sanitizeUser(user), ...session };
}

export async function refresh({ refreshToken, deviceInfo, ipAddress }) {
  if (!refreshToken) {
    throw ApiError.unauthorized("Refresh token is required");
  }

  const { userId, token } = await tokenService.rotateRefreshToken(refreshToken, {
    deviceInfo,
    ipAddress,
  });

  const user = await userRepository.findById(userId);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("Account no longer active");
  }

  return { accessToken: tokenService.signAccessToken(user), refreshToken: token };
}

export async function logout({ refreshToken }) {
  if (refreshToken) {
    await tokenService.revokeRefreshTokenByRaw(refreshToken);
  }
}

/**
 * The user-facing counterpart to what a ban/password-reset already does
 * internally: kill every session, on every device, right now — refresh
 * tokens (so nothing can mint a fresh access token afterward) and the
 * currently-issued access tokens (so existing ones stop working
 * immediately rather than trailing off over their remaining TTL). Unlike
 * those admin/security-triggered paths, this is something the user
 * themselves can reach for directly — "I think my account is compromised"
 * or "I lost my phone and want that session dead now" — previously only
 * available as a side effect of changing your password.
 */
export async function logoutAllDevices(userId) {
  await tokenRepository.revokeAllUserRefreshTokens(userId);
  await tokenService.revokeAllUserAccessTokens(userId);
}

export async function forgotPassword({ email }) {
  const user = await userRepository.findByEmail(email);

  // Always resolve the same way regardless of whether the account exists —
  // otherwise this endpoint becomes an email enumeration oracle.
  if (!user) return;

  const rawToken = generateRandomToken();
  await tokenRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    type: "PASSWORD_RESET",
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });
  await safeSendEmail(sendPasswordResetEmail, user, rawToken);
}

export async function resetPassword({ token, newPassword }) {
  const record = await tokenRepository.findValidVerificationToken(
    hashToken(token),
    "PASSWORD_RESET"
  );
  if (!record) {
    throw ApiError.badRequest("Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await userRepository.updatePasswordHash(record.userId, passwordHash);
  await tokenRepository.markVerificationTokenUsed(record.id);

  // A password reset means any previously-issued session may belong to
  // whoever had the account compromised — force re-authentication
  // everywhere, refresh and already-issued access tokens both.
  await tokenRepository.revokeAllUserRefreshTokens(record.userId);
  await tokenService.revokeAllUserAccessTokens(record.userId);
}

export async function verifyEmail({ token }) {
  const record = await tokenRepository.findValidVerificationToken(
    hashToken(token),
    "EMAIL_VERIFICATION"
  );
  if (!record) {
    throw ApiError.badRequest("Invalid or expired verification token");
  }

  await userRepository.markEmailVerified(record.userId);
  await tokenRepository.markVerificationTokenUsed(record.id);
}

export async function resendVerificationEmail({ email }) {
  const user = await userRepository.findByEmail(email);
  if (!user || user.isEmailVerified) return; // silent no-op, same reasoning as forgotPassword

  const rawToken = generateRandomToken();
  await tokenRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    type: "EMAIL_VERIFICATION",
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });
  await safeSendEmail(sendVerificationEmail, user, rawToken);
}

export async function googleAuth({ idToken, deviceInfo, ipAddress }) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw ApiError.internal("Google sign-in is not configured on this server");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized("Invalid Google ID token");
  }

  let user = await userRepository.findByGoogleId(payload.sub);

  if (!user) {
    const byEmail = await userRepository.findByEmail(payload.email);

    if (byEmail) {
      // Google has already verified this email, which is why we trust it
      // enough to silently link accounts instead of rejecting the login.
      user = await userRepository.linkGoogleId(byEmail.id, payload.sub);
    } else {
      user = await userRepository.createPassengerAccount({
        email: payload.email,
        passwordHash: null,
        firstName: payload.given_name ?? "Unknown",
        lastName: payload.family_name ?? "",
        googleId: payload.sub,
        isEmailVerified: true,
      });
    }
  }

  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  await userRepository.touchLastLogin(user.id);
  const session = await issueSession(user, { deviceInfo, ipAddress });
  return { user: sanitizeUser(user), ...session };
}
