import { ApiError } from "../utils/ApiError.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as vehicleRepository from "../repositories/vehicle.repository.js";
import * as geoService from "./geo.service.js";

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
 * REST-polled location updates (client pings every few seconds). The
 * Real-Time phase adds a Socket.IO stream for this same write — this
 * endpoint stays as the fallback/initial-registration path, since a
 * socket connection can drop mid-ride and a client needs a way back in.
 */
export async function updateLocation(userId, { lat, lng }) {
  const driver = await getOwnDriver(userId);
  if (!driver.isOnline) {
    throw ApiError.badRequest("Go online before sending location updates");
  }

  await driverRepository.updateLastKnownLocation(driver.id, lat, lng);
  await geoService.setDriverLocation(driver.id, lat, lng);
}
