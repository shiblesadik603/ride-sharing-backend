import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { googleClient } from "../config/google.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
import { hashToken, generateRandomToken } from "../utils/token.util.js";
import * as userRepository from "../repositories/user.repository.js";
import * as tokenRepository from "../repositories/token.repository.js";
import * as tokenService from "./token.service.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email.service.js";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

/** Registration and login should never fail because the mail provider is
 * down — the account/token state is already committed by the time we send,
 * so a delivery failure is logged and swallowed, not surfaced to the user. */
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
  await safeSendEmail(sendVerificationEmail, user.email, rawToken);

  const session = await issueSession(user);
  return { user: sanitizeUser(user), ...session };
}

export async function login({ email, password, deviceInfo, ipAddress }) {
  const user = await userRepository.findByEmail(email);

  // Same generic message whether the email doesn't exist, the account is
  // Google-only (no passwordHash), or the password is wrong — anything more
  // specific tells an attacker which emails have accounts.
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated");
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
  await safeSendEmail(sendPasswordResetEmail, user.email, rawToken);
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
  // whoever had the account compromised — force re-authentication everywhere.
  await tokenRepository.revokeAllUserRefreshTokens(record.userId);
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
  await safeSendEmail(sendVerificationEmail, user.email, rawToken);
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
