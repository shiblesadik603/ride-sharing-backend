import { describe, it, expect, afterAll } from "@jest/globals";
import { prisma } from "../../src/config/database.js";
import * as rideRepository from "../../src/repositories/ride.repository.js";
import {
  createTestPassenger,
  createTestDriver,
  deleteTestRide,
  deleteTestUser,
} from "../helpers/factories.js";

afterAll(async () => {
  await prisma.$disconnect();
});

function makeRideData(passengerId) {
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
  };
}

describe("ride.repository.tryAssignDriver (integration, real Postgres)", () => {
  it("assigns the driver and moves status to ACCEPTED on the first attempt", async () => {
    const passenger = await createTestPassenger();
    const driver = await createTestDriver();
    const ride = await rideRepository.create(makeRideData(passenger.passenger.id));

    const result = await rideRepository.tryAssignDriver(ride.id, driver.driver.id, null);
    const updated = await rideRepository.findById(ride.id);

    expect(result.count).toBe(1);
    expect(updated.status).toBe("ACCEPTED");
    expect(updated.driverId).toBe(driver.driver.id);

    await deleteTestRide(ride.id);
    await deleteTestUser(passenger.id);
    await deleteTestUser(driver.id);
  });

  it("the second attempt on an already-assigned ride affects zero rows", async () => {
    const passenger = await createTestPassenger();
    const driverA = await createTestDriver();
    const driverB = await createTestDriver();
    const ride = await rideRepository.create(makeRideData(passenger.passenger.id));

    await rideRepository.tryAssignDriver(ride.id, driverA.driver.id, null);
    const secondAttempt = await rideRepository.tryAssignDriver(ride.id, driverB.driver.id, null);
    const updated = await rideRepository.findById(ride.id);

    expect(secondAttempt.count).toBe(0);
    expect(updated.driverId).toBe(driverA.driver.id); // still the first driver, not overwritten

    await deleteTestRide(ride.id);
    await deleteTestUser(passenger.id);
    await deleteTestUser(driverA.id);
    await deleteTestUser(driverB.id);
  });

  /**
   * The test that actually matters: two drivers hitting accept on the
   * same REQUESTED ride at the same instant. This is the exact scenario
   * verified manually with curl during Phase 5 — reproduced here as an
   * automated, repeatable test instead of a one-off manual check.
   */
  it("under genuine concurrent access, exactly one of two competing drivers wins", async () => {
    const passenger = await createTestPassenger();
    const driverA = await createTestDriver();
    const driverB = await createTestDriver();
    const ride = await rideRepository.create(makeRideData(passenger.passenger.id));

    const [resultA, resultB] = await Promise.all([
      rideRepository.tryAssignDriver(ride.id, driverA.driver.id, null),
      rideRepository.tryAssignDriver(ride.id, driverB.driver.id, null),
    ]);

    const winners = [resultA, resultB].filter((r) => r.count === 1);
    const updated = await rideRepository.findById(ride.id);

    expect(winners).toHaveLength(1);
    expect(updated.status).toBe("ACCEPTED");
    expect([driverA.driver.id, driverB.driver.id]).toContain(updated.driverId);

    await deleteTestRide(ride.id);
    await deleteTestUser(passenger.id);
    await deleteTestUser(driverA.id);
    await deleteTestUser(driverB.id);
  });
});
