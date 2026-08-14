import { describe, it, expect, afterAll } from "@jest/globals";
import { prisma } from "../../src/config/database.js";
import * as driverService from "../../src/services/driver.service.js";
import * as driverRepository from "../../src/repositories/driver.repository.js";
import * as geoService from "../../src/services/geo.service.js";
import { createTestDriver, deleteTestUser } from "../helpers/factories.js";
import { closeAppConnections } from "../helpers/teardown.js";

// updateLocation/hasHeartbeat touch Redis directly, and importing
// config/redis.js at all creates *both* the `redis` and `redisSubscriber`
// clients as a side effect (both are top-level `new Redis(...)` calls) —
// closeAppConnections closes both, plus the BullMQ queue connections
// that are harmless-but-safe to close even though this file never opens
// them itself (closeAppConnections's own import of jobs/queues.js is what
// instantiates them). Reusing the one shared teardown instead of
// re-deriving a partial version of it, the same way ride-expiry.test.js
// does — see that file's own comment for how this was actually found (an
// open-handle debugging session, not guesswork).
afterAll(closeAppConnections);

/**
 * Covers driver.service.js's GPS-jump plausibility check, added in the
 * production-hardening pass to reject location updates that imply a
 * physically impossible speed (spoofed GPS, a client bug) while never
 * false-positiving on real driving, including a big-but-legitimate jump
 * after a long gap (tunnel, backgrounded app). Verified manually with
 * curl during that pass (a 900 km/h implied jump correctly dropped, a
 * ~40 km/h move correctly accepted); reproduced here as a repeatable test.
 */
describe("driver.service.updateLocation location plausibility (integration, real Postgres + Redis)", () => {
  async function onlineDriverAt(lat, lng, secondsAgo) {
    const driver = await createTestDriver();
    await driverRepository.setOnlineStatus(driver.driver.id, { isOnline: true, isAvailable: true });
    await prisma.driver.update({
      where: { id: driver.driver.id },
      data: { lastKnownLat: lat, lastKnownLng: lng, lastLocationAt: new Date(Date.now() - secondsAgo * 1000) },
    });
    return driver;
  }

  it("rejects a jump implying an impossible speed and leaves the last-known position unchanged", async () => {
    const driver = await onlineDriverAt(37.7749, -122.4194, 4); // San Francisco, 4s ago

    // New York, 4 seconds later — a physically impossible ~4,100 km jump.
    await driverService.updateLocation(driver.id, { lat: 40.7128, lng: -74.006 });

    const updated = await driverRepository.findById(driver.driver.id);
    expect(updated.lastKnownLat).toBeCloseTo(37.7749, 3);
    expect(updated.lastKnownLng).toBeCloseTo(-122.4194, 3);

    await deleteTestUser(driver.id);
  });

  it("accepts a move consistent with realistic driving speed", async () => {
    const driver = await onlineDriverAt(37.7749, -122.4194, 4);

    // ~44m in 4s ≈ 40 km/h — an ordinary city-driving speed.
    await driverService.updateLocation(driver.id, { lat: 37.77534, lng: -122.4194 });

    const updated = await driverRepository.findById(driver.driver.id);
    expect(updated.lastKnownLat).toBeCloseTo(37.77534, 4);

    await deleteTestUser(driver.id);
  });

  it("does not reject the very first ping (no prior position to compare against)", async () => {
    const driver = await createTestDriver();
    await driverRepository.setOnlineStatus(driver.driver.id, { isOnline: true, isAvailable: true });
    // lastKnownLat/Lng/lastLocationAt are all still null at this point.

    await driverService.updateLocation(driver.id, { lat: 51.5072, lng: -0.1276 }); // London

    const updated = await driverRepository.findById(driver.driver.id);
    expect(updated.lastKnownLat).toBeCloseTo(51.5072, 3);

    await deleteTestUser(driver.id);
  });

  it("a large jump over a large enough elapsed time is accepted (tunnel/backgrounded-app case)", async () => {
    // 500km over 1 hour = 500 km/h average is still implausible for a
    // single continuous drive, so use a distance/time pair that's a
    // realistic "was in a dead zone for a while" scenario: ~30km over
    // 30 minutes = 60 km/h average, well within plausible range.
    const driver = await onlineDriverAt(37.7749, -122.4194, 30 * 60);

    await driverService.updateLocation(driver.id, { lat: 38.0, lng: -122.4194 }); // ~28km north

    const updated = await driverRepository.findById(driver.driver.id);
    expect(updated.lastKnownLat).toBeCloseTo(38.0, 2);

    await deleteTestUser(driver.id);
  });

  it("still refreshes the heartbeat even when the position sample itself is rejected", async () => {
    // A rejected *position* still proves the driver's connection is
    // alive — the heartbeat sweep shouldn't force them offline just
    // because one bad sample arrived.
    const driver = await onlineDriverAt(37.7749, -122.4194, 4);

    await driverService.updateLocation(driver.id, { lat: 40.7128, lng: -74.006 }); // rejected

    const alive = await geoService.hasHeartbeat(driver.driver.id);
    expect(alive).toBe(true);

    await deleteTestUser(driver.id);
  });
});
