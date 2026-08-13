import jwt from "jsonwebtoken";
import ms from "ms";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { hashToken, generateRandomToken } from "../utils/token.util.js";
import * as tokenRepository from "../repositories/token.repository.js";

// ---------------------------------------------------------------------------
// Access tokens — stateless JWTs, verified by signature alone, never touch
// the DB. Short-lived (15m default) so a leaked one self-invalidates fast.
// ---------------------------------------------------------------------------

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch {
    throw ApiError.unauthorized("Invalid or expired access token");
  }
}

// ---------------------------------------------------------------------------
// Refresh tokens — deliberately NOT JWTs. They're opaque random strings
// looked up in the DB on every use, so JWT's "stateless" property would buy
// us nothing here (revocation requires a DB hit regardless) while costing
// us the complexity of embedding/signing an id. Only the hash is stored;
// the raw value exists on the wire once, at issuance.
// ---------------------------------------------------------------------------

export async function issueRefreshToken(userId, { deviceInfo, ipAddress } = {}) {
  const raw = generateRandomToken();
  const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_EXPIRES_IN));

  await tokenRepository.createRefreshToken({
    userId,
    tokenHash: hashToken(raw),
    deviceInfo,
    ipAddress,
    expiresAt,
  });

  return raw;
}

/**
 * Verifies a presented refresh token and rotates it: the old DB row is
 * revoked and a new one issued in its place. Rotation means a stolen
 * refresh token is only ever usable once before the legitimate client's
 * next refresh call revokes it — narrowing the exploit window to a single
 * request race instead of the token's full multi-day lifetime.
 *
 * If the presented token hashes to a row that's already revoked, that's a
 * signal it was replayed after rotation (attacker with a stolen copy, or
 * the legitimate client retrying a request whose response was lost) — the
 * safe response is to kill every session for that user, not just this one.
 */
export async function rotateRefreshToken(presentedToken, { deviceInfo, ipAddress } = {}) {
  const record = await tokenRepository.findRefreshTokenByHash(hashToken(presentedToken));

  if (!record) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  if (record.revokedAt || record.expiresAt < new Date()) {
    await tokenRepository.revokeAllUserRefreshTokens(record.userId);
    throw ApiError.unauthorized("Refresh token reuse detected — all sessions revoked");
  }

  await tokenRepository.revokeRefreshToken(record.id);

  const newToken = await issueRefreshToken(record.userId, { deviceInfo, ipAddress });
  return { userId: record.userId, token: newToken };
}

export async function revokeRefreshTokenByRaw(presentedToken) {
  const record = await tokenRepository.findRefreshTokenByHash(hashToken(presentedToken));
  if (record && !record.revokedAt) {
    await tokenRepository.revokeRefreshToken(record.id);
  }
}

// ---------------------------------------------------------------------------
// Cookie options for the refresh token — centralized so set and clear never
// drift out of sync (a mismatched `path`/`sameSite` silently breaks clearing).
// ---------------------------------------------------------------------------

export const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: ms(env.JWT_REFRESH_EXPIRES_IN),
};
