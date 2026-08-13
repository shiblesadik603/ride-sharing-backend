import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
import * as userRepository from "../repositories/user.repository.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as tokenRepository from "../repositories/token.repository.js";

export async function getProfile(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  return sanitizeUser(user);
}

export async function updateProfile(userId, data) {
  const user = await userRepository.updateProfile(userId, data);
  return sanitizeUser(user);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await userRepository.findById(userId);

  if (!user.passwordHash) {
    throw ApiError.badRequest(
      "This account has no password set (signed up via Google). Use 'Forgot Password' to set one."
    );
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw ApiError.badRequest("Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await userRepository.updatePasswordHash(userId, passwordHash);

  // Same reasoning as a forgot-password reset: a password change should
  // invalidate every other session in case this one is the attacker's.
  await tokenRepository.revokeAllUserRefreshTokens(userId);
}

/**
 * One-way upgrade: PASSENGER -> DRIVER. The passenger role/profile is kept
 * (a driver can still book rides as a rider), only a Driver extension is
 * added. Vehicle registration and document verification happen in a later
 * phase — this just establishes driver identity and starts them at
 * verificationStatus PENDING.
 */
export async function becomeDriver(userId, { licenseNumber, licenseExpiry }) {
  const user = await userRepository.findById(userId);

  if (user.role !== "PASSENGER") {
    throw ApiError.conflict("Only passenger accounts can apply to become a driver");
  }

  const existing = await driverRepository.findByUserId(userId);
  if (existing) {
    throw ApiError.conflict("A driver profile already exists for this account");
  }

  const updated = await userRepository.promoteToDriver(userId, { licenseNumber, licenseExpiry });
  return sanitizeUser(updated);
}
