import { prisma } from "../config/database.js";

export function create(passengerId, driverId) {
  return prisma.favoriteDriver.create({ data: { passengerId, driverId } });
}

/**
 * A defensive cap, not real pagination: unlike ride/payment history, this
 * is a naturally small, self-limited collection — nobody accumulates
 * thousands of favorite drivers the way they accumulate rides over years
 * of use. Building out page/limit query params for a list that's never
 * realistically going to exceed a few dozen rows would be complexity with
 * no real benefit; the actual risk this guards against is an unbounded
 * `findMany` on a table with no LIMIT at all, which `take` closes cheaply.
 */
export function listByPassenger(passengerId) {
  return prisma.favoriteDriver.findMany({
    where: { passengerId },
    orderBy: { createdAt: "desc" },
    take: 200,
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
