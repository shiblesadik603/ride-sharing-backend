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

/** Includes role-extension summaries so `GET /users/me` doesn't need a
 * second round trip to show a passenger their rating or a driver their
 * online status. */
export function findByIdWithProfile(id) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      passenger: true,
      driver: true,
      wallet: { select: { balance: true, currency: true } },
    },
  });
}

export function updateProfile(userId, data) {
  return prisma.user.update({ where: { id: userId }, data });
}

/**
 * Role upgrade, not a fresh signup — the User row and its Passenger/Wallet
 * already exist. Only adds the Driver extension and flips `role`; the
 * service layer is responsible for rejecting this when the user is already
 * a driver or is an admin.
 */
export function promoteToDriver(userId, { licenseNumber, licenseExpiry }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      role: "DRIVER",
      driver: { create: { licenseNumber, licenseExpiry } },
    },
    include: { driver: true },
  });
}

function buildUserListWhere({ role, isActive, search }) {
  return {
    ...(role && { role }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ],
    }),
  };
}

export function listUsers({ page, limit, role, isActive, search }) {
  const where = buildUserListWhere({ role, isActive, search });
  return prisma.user.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}

export function countUsers({ role, isActive, search }) {
  return prisma.user.count({ where: buildUserListWhere({ role, isActive, search }) });
}

export function setActiveStatus(userId, isActive) {
  return prisma.user.update({ where: { id: userId }, data: { isActive } });
}
