import { ApiError } from "../utils/ApiError.js";
import * as ratingRepository from "../repositories/rating.repository.js";
import * as rideRepository from "../repositories/ride.repository.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as passengerRepository from "../repositories/passenger.repository.js";

/**
 * Recomputes the ratee's cached averageRating from the Rating table (the
 * source of truth) rather than incrementally adjusting a running average —
 * an AVG() aggregate over what's usually a handful-to-low-hundreds of rows
 * per user is cheap, and it can never drift out of sync with the
 * underlying ratings the way a running-average update could after, say, a
 * rating gets disputed and removed by an admin down the line.
 */
async function refreshAverageRating(direction, rateeUserId) {
  const average = await ratingRepository.averageForUser(rateeUserId);
  const rounded = Number(average.toFixed(2));

  if (direction === "PASSENGER_TO_DRIVER") {
    const driver = await driverRepository.findByUserId(rateeUserId);
    if (driver) await driverRepository.setAverageRating(driver.id, rounded);
  } else {
    const passenger = await passengerRepository.findByUserId(rateeUserId);
    if (passenger) await passengerRepository.setAverageRating(passenger.id, rounded);
  }
}

export async function submitRating(userId, rideId, { value, comment }) {
  const ride = await rideRepository.findById(rideId);
  if (!ride) throw ApiError.notFound("Ride not found");

  let direction;
  let rateeUserId;
  if (ride.passenger.userId === userId) {
    direction = "PASSENGER_TO_DRIVER";
    rateeUserId = ride.driver?.userId;
  } else if (ride.driver?.userId === userId) {
    direction = "DRIVER_TO_PASSENGER";
    rateeUserId = ride.passenger.userId;
  } else {
    throw ApiError.notFound("Ride not found");
  }

  if (ride.status !== "COMPLETED") {
    throw ApiError.conflict("Only a completed ride can be rated");
  }
  if (!rateeUserId) {
    throw ApiError.conflict("This ride has no counterpart to rate");
  }

  const existing = await ratingRepository.findByRideAndDirection(rideId, direction);
  if (existing) {
    throw ApiError.conflict("You have already rated this ride");
  }

  const rating = await ratingRepository.create({
    rideId,
    raterId: userId,
    rateeId: rateeUserId,
    direction,
    value,
    comment,
  });

  await refreshAverageRating(direction, rateeUserId);

  return rating;
}

export async function getRatingsForRide(userId, userRole, rideId) {
  const ride = await rideRepository.findById(rideId);
  if (!ride) throw ApiError.notFound("Ride not found");

  const isPassenger = ride.passenger.userId === userId;
  const isDriver = ride.driver?.userId === userId;
  if (!isPassenger && !isDriver && userRole !== "ADMIN") {
    throw ApiError.notFound("Ride not found");
  }

  return ratingRepository.listByRide(rideId);
}

export async function listMyReceivedRatings(userId, { page, limit }) {
  const [ratings, total] = await Promise.all([
    ratingRepository.listReceivedByUser(userId, { page, limit }),
    ratingRepository.countReceivedByUser(userId),
  ]);

  return { ratings, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
