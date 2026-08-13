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
