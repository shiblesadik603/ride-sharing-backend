import { prisma } from "../config/database.js";

export function countCompletedRides(from, to) {
  return prisma.ride.count({ where: { status: "COMPLETED", completedAt: { gte: from, lt: to } } });
}

export function countCancelledRides(from, to) {
  return prisma.ride.count({ where: { status: "CANCELLED", cancelledAt: { gte: from, lt: to } } });
}

export async function sumRevenue(from, to) {
  const result = await prisma.payment.aggregate({
    where: { status: "COMPLETED", paidAt: { gte: from, lt: to } },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

export function countNewUsers(from, to) {
  return prisma.user.count({ where: { createdAt: { gte: from, lt: to } } });
}

export function countNewDrivers(from, to) {
  return prisma.driver.count({ where: { createdAt: { gte: from, lt: to } } });
}

export function countOnlineDrivers() {
  return prisma.driver.count({ where: { isOnline: true } });
}

export function listActiveAdmins() {
  return prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, email: true },
  });
}
