import crypto from "node:crypto";
import { prisma } from "../../src/config/database.js";

export function uniqueEmail(prefix = "test") {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

/**
 * Every ride-sharing test that needs a passenger wants the same three
 * rows (User, Passenger, Wallet) — this is the same nested-create shape
 * `user.repository.js: createPassengerAccount` uses in the real app, kept
 * separate here so tests don't import a service module just to set up
 * fixture data.
 */
export function createTestPassenger(overrides = {}) {
  return prisma.user.create({
    data: {
      email: uniqueEmail("passenger"),
      firstName: "Test",
      lastName: "Passenger",
      role: "PASSENGER",
      isEmailVerified: true,
      passenger: { create: {} },
      wallet: { create: {} },
      ...overrides,
    },
    include: { passenger: true, wallet: true },
  });
}

export function createTestDriver(overrides = {}) {
  return prisma.user.create({
    data: {
      email: uniqueEmail("driver"),
      firstName: "Test",
      lastName: "Driver",
      role: "DRIVER",
      isEmailVerified: true,
      driver: {
        create: {
          licenseNumber: `TEST-${crypto.randomUUID().slice(0, 8)}`,
          licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          verificationStatus: "APPROVED",
        },
      },
      ...overrides,
    },
    include: { driver: true },
  });
}

// Ride.passenger/driver have no onDelete: Cascade (deliberately — ride
// history shouldn't vanish because an account was deleted) — tests that
// create rides must delete them before deleting the owning user, or the
// FK constraint rejects the user delete.
export function deleteTestRide(rideId) {
  return prisma.ride.delete({ where: { id: rideId } }).catch(() => {});
}

export function deleteTestUser(userId) {
  return prisma.user.delete({ where: { id: userId } }).catch(() => {});
}
