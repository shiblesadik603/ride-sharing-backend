import { prisma } from "../config/database.js";

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

export function createRefreshToken({ userId, tokenHash, deviceInfo, ipAddress, expiresAt }) {
  return prisma.refreshToken.create({
    data: { userId, tokenHash, deviceInfo, ipAddress, expiresAt },
  });
}

export function findRefreshTokenByHash(tokenHash) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

export function revokeRefreshToken(id) {
  return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

/**
 * Used both on logout-everywhere and as the reuse-detection response: if a
 * refresh token that's already been rotated away gets presented again, the
 * simplest safe assumption is that it was stolen — revoke every session for
 * that user rather than trying to guess which one is legitimate.
 */
export function revokeAllUserRefreshTokens(userId) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Verification tokens (email verification + password reset)
// ---------------------------------------------------------------------------

/**
 * Deletes any prior unused token of the same type before issuing a new one,
 * so a user who requests three password resets in a row only ever has one
 * valid link at a time — earlier emails silently stop working.
 */
export function createVerificationToken({ userId, tokenHash, type, expiresAt }) {
  return prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { userId, type, usedAt: null } });
    return tx.verificationToken.create({ data: { userId, tokenHash, type, expiresAt } });
  });
}

export function findValidVerificationToken(tokenHash, type) {
  return prisma.verificationToken.findFirst({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
  });
}

export function markVerificationTokenUsed(id) {
  return prisma.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
}
