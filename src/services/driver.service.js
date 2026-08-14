import { ApiError } from "../utils/ApiError.js";
import { logger } from "../config/logger.js";
import { haversineDistanceMeters } from "../utils/geo.util.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as vehicleRepository from "../repositories/vehicle.repository.js";
import * as rideRepository from "../repositories/ride.repository.js";
import * as geoService from "./geo.service.js";
import { emitToUser } from "../sockets/socket.emitter.js";

// Generous on purpose — this exists to catch teleportation (a spoofed
// jump across a city, a client bug sending garbage coordinates), not to
// second-guess a fast highway driver. Real driving never comes close to
// this; a GPS reading implying it almost certainly isn't real.
const MAX_PLAUSIBLE_SPEED_KMH = 200;
// Guards two things at once: division blowing up on back-to-back pings a
// fraction of a second apart, and — more importantly — legitimate "big
// jump" cases like a tunnel, a backgrounded app, or a dead zone. A large
// distance covered over a large enough elapsed time is just normal
// driving; it only looks like teleportation when both numbers are
// evaluated together, which is exactly what implied *speed* does versus
// distance alone.
const MIN_ELAPSED_SECONDS_FOR_PLAUSIBILITY_CHECK = 3;

async function getOwnDriver(userId) {
  const driver = await driverRepository.findByUserId(userId);
  if (!driver) throw ApiError.forbidden("Only driver accounts can perform this action");
  return driver;
}

export async function goOnline(userId, { lat, lng }) {
  const driver = await getOwnDriver(userId);

  if (driver.verificationStatus !== "APPROVED") {
    throw ApiError.forbidden("Your driver account is not yet approved");
  }

  const vehicles = await vehicleRepository.listActiveVerifiedByDriver(driver.id);
  if (vehicles.length === 0) {
    throw ApiError.forbidden("Add a vehicle and get it verified before going online");
  }

  await driverRepository.setOnlineStatus(driver.id, { isOnline: true, isAvailable: true });
  await driverRepository.updateLastKnownLocation(driver.id, lat, lng);
  await geoService.setDriverLocation(driver.id, lat, lng);
  await geoService.refreshHeartbeat(driver.id);

  return { isOnline: true };
}

export async function goOffline(userId) {
  const driver = await getOwnDriver(userId);
  await driverRepository.setOnlineStatus(driver.id, { isOnline: false, isAvailable: false });
  await geoService.removeDriverLocation(driver.id);
  await geoService.clearHeartbeat(driver.id);
  return { isOnline: false };
}

/**
 * Runs on a schedule (see jobs/processors/cleanup.processor.js). Compares
 * every driver Postgres believes is online against their Redis heartbeat
 * — refreshed on every location ping and on going online, TTL'd so it
 * naturally expires if pings stop. A driver whose heartbeat lapsed did not
 * cleanly call /me/offline (crash, dead battery, network drop, or simply
 * a socket disconnect with no other device still pinging on their
 * behalf), so this is what actually gets them out of the matching pool
 * instead of leaving them geo-discoverable and isOnline:true forever.
 *
 * Deliberately doesn't touch any ride the driver might be mid-trip on —
 * a driver going dark during an active ride is a support situation, not
 * something this sweep should try to resolve by itself.
 */
export async function expireStaleHeartbeats() {
  const onlineDrivers = await driverRepository.listOnlineIds();
  let expiredCount = 0;

  for (const { id: driverId } of onlineDrivers) {
    const alive = await geoService.hasHeartbeat(driverId);
    if (alive) continue;

    await driverRepository.setOnlineStatus(driverId, { isOnline: false, isAvailable: false });
    await geoService.removeDriverLocation(driverId);
    expiredCount++;
  }

  return { checked: onlineDrivers.length, expiredCount };
}

/**
 * Called from both the REST endpoint and the `driver:location` socket
 * event — one code path, two entry points, so a client that falls back to
 * REST after a dropped socket connection gets identical behavior
 * (including the live broadcast below), not a degraded version of it.
 */
export async function updateLocation(userId, { lat, lng }) {
  const driver = await getOwnDriver(userId);
  if (!driver.isOnline) {
    throw ApiError.badRequest("Go online before sending location updates");
  }

  // A received ping — even one whose *position* turns out to be
  // implausible below — still proves the driver's connection is alive,
  // which is all the heartbeat is attesting to. Refreshing it here, before
  // the plausibility check, means a burst of bad samples doesn't also
  // make the heartbeat sweep wrongly conclude the driver went dark.
  await geoService.refreshHeartbeat(driver.id);

  if (driver.lastKnownLat != null && driver.lastKnownLng != null && driver.lastLocationAt) {
    const elapsedSeconds = (Date.now() - driver.lastLocationAt.getTime()) / 1000;
    if (elapsedSeconds >= MIN_ELAPSED_SECONDS_FOR_PLAUSIBILITY_CHECK) {
      const distanceKm =
        haversineDistanceMeters(driver.lastKnownLat, driver.lastKnownLng, lat, lng) / 1000;
      const impliedSpeedKmh = distanceKm / (elapsedSeconds / 3600);

      if (impliedSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
        // Drop the sample rather than either erroring (a false positive
        // here shouldn't interrupt a real driver mid-trip) or trusting it
        // (which would silently teleport their tracked position). The
        // next legitimate ping updates things normally — this only ever
        // discards one bad reading, never blocks the driver going forward.
        logger.warn("Rejected implausible driver location jump", {
          driverId: driver.id,
          impliedSpeedKmh: Math.round(impliedSpeedKmh),
          distanceKm: Math.round(distanceKm * 10) / 10,
          elapsedSeconds: Math.round(elapsedSeconds),
        });
        return;
      }
    }
  }

  await driverRepository.updateLastKnownLocation(driver.id, lat, lng);
  await geoService.setDriverLocation(driver.id, lat, lng);

  // REQUESTED doesn't apply here (no driver assigned yet), so this only
  // ever fires for ACCEPTED/ARRIVED/IN_PROGRESS — exactly when a
  // passenger is actually waiting on live position.
  const activeRide = await rideRepository.findActiveByDriverWithPassengerId(driver.id);
  if (activeRide && activeRide.status !== "REQUESTED") {
    emitToUser(activeRide.passenger.userId, "driver:location", {
      rideId: activeRide.id,
      lat,
      lng,
    });
  }
}
