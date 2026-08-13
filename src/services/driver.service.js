import { ApiError } from "../utils/ApiError.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as vehicleRepository from "../repositories/vehicle.repository.js";
import * as rideRepository from "../repositories/ride.repository.js";
import * as geoService from "./geo.service.js";
import { emitToUser } from "../sockets/socket.emitter.js";

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

  return { isOnline: true };
}

export async function goOffline(userId) {
  const driver = await getOwnDriver(userId);
  await driverRepository.setOnlineStatus(driver.id, { isOnline: false, isAvailable: false });
  await geoService.removeDriverLocation(driver.id);
  return { isOnline: false };
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
