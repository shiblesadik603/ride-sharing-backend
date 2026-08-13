import { prisma } from "../config/database.js";

export function findById(id) {
  return prisma.driver.findUnique({ where: { id } });
}

export function findByUserId(userId) {
  return prisma.driver.findUnique({ where: { userId } });
}

/** Full detail view for admin review: identity, license, and everything
 * needed to make an approve/reject decision in one request. */
export function findByIdWithDetails(id) {
  return prisma.driver.findUnique({
    where: { id },
    include: {
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      vehicles: { include: { documents: true } },
    },
  });
}

export function list({ page, limit, verificationStatus }) {
  return prisma.driver.findMany({
    where: verificationStatus ? { verificationStatus } : undefined,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: "asc" }, // oldest pending requests reviewed first
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });
}

/** Lean projection for ride-offer dispatch — runs once per nearby driver
 * on every new ride request, so it selects only the eligibility fields
 * instead of the full admin detail view's vehicle/document join. */
export function findByIdForDispatch(id) {
  return prisma.driver.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      isOnline: true,
      isAvailable: true,
      verificationStatus: true,
      vehicles: { where: { isActive: true, isVerified: true }, select: { type: true } },
    },
  });
}

export function count({ verificationStatus }) {
  return prisma.driver.count({ where: verificationStatus ? { verificationStatus } : undefined });
}

export function setVerificationStatus(id, verificationStatus) {
  return prisma.driver.update({
    where: { id },
    data: {
      verificationStatus,
      verifiedAt: verificationStatus === "APPROVED" ? new Date() : null,
    },
  });
}

export function setOnlineStatus(id, { isOnline, isAvailable }) {
  return prisma.driver.update({ where: { id }, data: { isOnline, isAvailable } });
}

export function setAvailable(id, isAvailable) {
  return prisma.driver.update({ where: { id }, data: { isAvailable } });
}

export function updateLastKnownLocation(id, lat, lng) {
  return prisma.driver.update({
    where: { id },
    data: { lastKnownLat: lat, lastKnownLng: lng, lastLocationAt: new Date() },
  });
}

export function incrementCompletedRideStats(id, earningsAmount) {
  return prisma.driver.update({
    where: { id },
    data: { totalRides: { increment: 1 }, totalEarnings: { increment: earningsAmount } },
  });
}

export function setAverageRating(id, averageRating) {
  return prisma.driver.update({ where: { id }, data: { averageRating } });
}
