import { prisma } from "../config/database.js";

export function create(data) {
  return prisma.rating.create({ data });
}

export function findByRideAndDirection(rideId, direction) {
  return prisma.rating.findUnique({ where: { rideId_direction: { rideId, direction } } });
}

export function listByRide(rideId) {
  return prisma.rating.findMany({ where: { rideId } });
}

export function listReceivedByUser(rateeId, { page, limit }) {
  return prisma.rating.findMany({
    where: { rateeId },
    include: { rater: { select: { firstName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countReceivedByUser(rateeId) {
  return prisma.rating.count({ where: { rateeId } });
}

export async function averageForUser(rateeId) {
  const result = await prisma.rating.aggregate({ where: { rateeId }, _avg: { value: true } });
  return result._avg.value ?? 0;
}
