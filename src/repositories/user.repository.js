import { prisma } from "../config/database.js";

export function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export function findById(id) {
  return prisma.user.findUnique({ where: { id } });
}

export function findByGoogleId(googleId) {
  return prisma.user.findUnique({ where: { googleId } });
}

/**
 * A new account isn't just a `User` row — it needs its role extension
 * (Passenger stats) and a Wallet to ever receive a refund or pay by wallet.
 * All three are created in one transaction so a crash mid-registration
 * can never leave a User without a Passenger/Wallet row.
 */
export function createPassengerAccount({
  email,
  passwordHash,
  firstName,
  lastName,
  phone,
  googleId,
  isEmailVerified,
}) {
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      phone,
      googleId,
      isEmailVerified,
      role: "PASSENGER",
      passenger: { create: {} },
      wallet: { create: {} },
    },
  });
}

export function updatePasswordHash(userId, passwordHash) {
  return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export function markEmailVerified(userId) {
  return prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } });
}

export function linkGoogleId(userId, googleId) {
  return prisma.user.update({ where: { id: userId }, data: { googleId } });
}

export function touchLastLogin(userId) {
  return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}
