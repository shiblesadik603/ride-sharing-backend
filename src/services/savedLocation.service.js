import { ApiError } from "../utils/ApiError.js";
import * as passengerRepository from "../repositories/passenger.repository.js";
import * as savedLocationRepository from "../repositories/savedLocation.repository.js";

/**
 * Every saved-location action is scoped to the caller's own Passenger
 * record — resolved from their userId, never trusted from the request.
 * `authenticate` guarantees *who* is calling; this guarantees they only
 * ever touch *their own* rows, regardless of what id the client passes.
 */
async function getOwnPassengerId(userId) {
  const passenger = await passengerRepository.findByUserId(userId);
  if (!passenger) {
    throw ApiError.forbidden("Only passenger accounts can manage saved locations");
  }
  return passenger.id;
}

async function assertOwnership(locationId, passengerId) {
  const location = await savedLocationRepository.findById(locationId);
  if (!location || location.passengerId !== passengerId) {
    throw ApiError.notFound("Saved location not found");
  }
  return location;
}

export async function list(userId) {
  const passengerId = await getOwnPassengerId(userId);
  return savedLocationRepository.listByPassenger(passengerId);
}

export async function create(userId, data) {
  const passengerId = await getOwnPassengerId(userId);
  return savedLocationRepository.create(passengerId, data);
}

export async function update(userId, locationId, data) {
  const passengerId = await getOwnPassengerId(userId);
  await assertOwnership(locationId, passengerId);
  return savedLocationRepository.update(locationId, data);
}

export async function remove(userId, locationId) {
  const passengerId = await getOwnPassengerId(userId);
  await assertOwnership(locationId, passengerId);
  await savedLocationRepository.remove(locationId);
}
