import { ApiError } from "../utils/ApiError.js";
import * as passengerRepository from "../repositories/passenger.repository.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as favoriteDriverRepository from "../repositories/favoriteDriver.repository.js";

async function getOwnPassengerId(userId) {
  const passenger = await passengerRepository.findByUserId(userId);
  if (!passenger) {
    throw ApiError.forbidden("Only passenger accounts can manage favorite drivers");
  }
  return passenger.id;
}

export async function list(userId) {
  const passengerId = await getOwnPassengerId(userId);
  return favoriteDriverRepository.listByPassenger(passengerId);
}

export async function add(userId, driverId) {
  const passengerId = await getOwnPassengerId(userId);

  const driver = await driverRepository.findById(driverId);
  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }

  const existing = await favoriteDriverRepository.findByPassengerAndDriver(
    passengerId,
    driverId
  );
  if (existing) {
    throw ApiError.conflict("This driver is already in your favorites");
  }

  return favoriteDriverRepository.create(passengerId, driverId);
}

export async function remove(userId, driverId) {
  const passengerId = await getOwnPassengerId(userId);
  // Relies on the global error handler mapping Prisma's P2025 ("record
  // to delete does not exist") to a 404 — no need for a redundant lookup.
  await favoriteDriverRepository.removeByPassengerAndDriver(passengerId, driverId);
}
