import { prisma } from "../config/database.js";

export function findByUserId(userId) {
  return prisma.passenger.findUnique({ where: { userId } });
}

export function incrementCompletedRideStats(id) {
  return prisma.passenger.update({ where: { id }, data: { totalRides: { increment: 1 } } });
}
