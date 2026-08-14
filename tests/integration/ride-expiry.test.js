import { describe, it, expect, afterAll } from "@jest/globals";
import { prisma } from "../../src/config/database.js";
import * as rideRepository from "../../src/repositories/ride.repository.js";
import * as driverRepository from "../../src/repositories/driver.repository.js";
import * as rideService from "../../src/services/ride.service.js";
import {
  createTestPassenger,
  createTestDriver,
  deleteTestRide,
  deleteTestUser,
} from "../helpers/factories.js";
import { closeAppConnections } from "../helpers/teardown.js";

// ride.service.js imports config/metrics.js (for ride_outcomes_total),
// which imports jobs/queues.js to sample queue depth — same import chain
// tests/helpers/teardown.js's own comment already documents for app.js,
// just reached through a different module this time. closeAppConnections
// already closes all of it (the three BullMQ queues, queueConnection,
// redis, redisSubscriber) — reusing it here instead of re-deriving a
// partial version of the same teardown.
afterAll(closeAppConnections);

function baseRideData(passengerId, overrides = {}) {
  return {
    passengerId,
    requestedVehicleType: "SEDAN",
    pickupAddress: "Test Pickup",
    pickupLat: 37.7749,
    pickupLng: -122.4194,
    dropoffAddress: "Test Dropoff",
    dropoffLat: 37.7694,
    dropoffLng: -122.4862,
    otpCode: "1234",
    estimatedFare: 15.0,
    currency: "USD",
    ...overrides,
  };
}

const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000);

/**
 * Covers ride.service.js's expireStaleRides — added in the production-
 * hardening pass so a REQUESTED ride nobody accepts, or an ACCEPTED ride
 * whose driver never arrives, resolves itself instead of stranding a
 * passenger/driver indefinitely. Verified manually with curl during that
 * pass; reproduced here as a repeatable test.
 */
describe("ride.service.expireStaleRides (integration, real Postgres)", () => {
  it("cancels a REQUESTED ride older than the timeout, as a SYSTEM cancellation", async () => {
    const passenger = await createTestPassenger();
    const ride = await rideRepository.create(
      baseRideData(passenger.passenger.id, { requestedAt: minutesAgo(10) })
    );

    const result = await rideService.expireStaleRides();
    const updated = await rideRepository.findById(ride.id);

    expect(result.expiredRequested).toBeGreaterThanOrEqual(1);
    expect(updated.status).toBe("CANCELLED");
    expect(updated.cancelledBy).toBe("SYSTEM");
    expect(updated.cancellationReason).toMatch(/no driver accepted/i);

    await deleteTestRide(ride.id);
    await deleteTestUser(passenger.id);
  });

  it("does not touch a REQUESTED ride younger than the timeout", async () => {
    const passenger = await createTestPassenger();
    const ride = await rideRepository.create(
      baseRideData(passenger.passenger.id, { requestedAt: minutesAgo(1) })
    );

    await rideService.expireStaleRides();
    const updated = await rideRepository.findById(ride.id);

    expect(updated.status).toBe("REQUESTED");

    await deleteTestRide(ride.id);
    await deleteTestUser(passenger.id);
  });

  it("cancels a stale ACCEPTED ride and frees the driver back to available", async () => {
    const passenger = await createTestPassenger();
    const driver = await createTestDriver();
    await driverRepository.setOnlineStatus(driver.driver.id, { isOnline: true, isAvailable: false });

    const ride = await rideRepository.create(baseRideData(passenger.passenger.id));
    await rideRepository.tryAssignDriver(ride.id, driver.driver.id, null);
    // Backdate acceptedAt directly — tryAssignDriver always stamps "now."
    await prisma.ride.update({ where: { id: ride.id }, data: { acceptedAt: minutesAgo(20) } });

    const result = await rideService.expireStaleRides();
    const updatedRide = await rideRepository.findById(ride.id);
    const updatedDriver = await driverRepository.findById(driver.driver.id);

    expect(result.expiredAccepted).toBeGreaterThanOrEqual(1);
    expect(updatedRide.status).toBe("CANCELLED");
    expect(updatedRide.cancellationReason).toMatch(/did not arrive/i);
    // The whole point of making cancelRide/expireStaleRides transactional:
    // the driver must come back out of "mid-ride" limbo, not stay stuck.
    expect(updatedDriver.isAvailable).toBe(true);

    await deleteTestRide(ride.id);
    await deleteTestUser(passenger.id);
    await deleteTestUser(driver.id);
  });

  it("a ride that legitimately transitions between being read and being expired is left alone", async () => {
    // Simulates the race this function is specifically guarded against:
    // by the time the sweep gets around to writing CANCELLED, the ride
    // has already moved on (here, simulated by cancelling it directly
    // first) — the conditional update must find zero rows affected and
    // skip it, not clobber whatever state it's actually in now.
    const passenger = await createTestPassenger();
    const ride = await rideRepository.create(
      baseRideData(passenger.passenger.id, { requestedAt: minutesAgo(10) })
    );
    await rideRepository.updateStatus(ride.id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: "PASSENGER",
    });

    await rideService.expireStaleRides();
    const updated = await rideRepository.findById(ride.id);

    expect(updated.cancelledBy).toBe("PASSENGER"); // not overwritten to SYSTEM

    await deleteTestRide(ride.id);
    await deleteTestUser(passenger.id);
  });
});
