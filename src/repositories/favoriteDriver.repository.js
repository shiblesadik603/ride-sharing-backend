import { prisma } from "../config/database.js";

export function create(passengerId, driverId) {
  return prisma.favoriteDriver.create({ data: { passengerId, driverId } });
}

export function listByPassenger(passengerId) {
  return prisma.favoriteDriver.findMany({
    where: { passengerId },
    orderBy: { createdAt: "desc" },
    include: {
      driver: {
        select: {
          id: true,
          averageRating: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
  });
}

export function findByPassengerAndDriver(passengerId, driverId) {
  return prisma.favoriteDriver.findUnique({
    where: { passengerId_driverId: { passengerId, driverId } },
  });
}

export function removeByPassengerAndDriver(passengerId, driverId) {
  return prisma.favoriteDriver.delete({
    where: { passengerId_driverId: { passengerId, driverId } },
  });
}
