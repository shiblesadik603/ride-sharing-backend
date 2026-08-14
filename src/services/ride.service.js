import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import { ApiError } from "../utils/ApiError.js";
import { generateOtp } from "../utils/otp.util.js";
import { estimateFare } from "../utils/fare.util.js";
import * as rideRepository from "../repositories/ride.repository.js";
import * as rideStatusLogRepository from "../repositories/rideStatusLog.repository.js";
import * as passengerRepository from "../repositories/passenger.repository.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as vehicleRepository from "../repositories/vehicle.repository.js";
import * as geoService from "./geo.service.js";
import * as mapsService from "./maps.service.js";
import { emitToUser } from "../sockets/socket.emitter.js";
import { rideOutcomesTotal } from "../config/metrics.js";

const DEFAULT_SEARCH_RADIUS_KM = 5;
const CANCELLABLE_STATUSES = ["REQUESTED", "ACCEPTED", "ARRIVED"];
const MAX_OTP_ATTEMPTS = 5;
const OTP_ATTEMPT_WINDOW_SECONDS = 15 * 60;
// Measured from arrivedAt, not ride creation: the OTP only matters once the
// driver is physically at pickup waiting for it, and matching itself can
// legitimately take a while before that point. An OTP with no expiry at
// all stays valid (and guessable within the attempt cap) indefinitely.
const OTP_VALIDITY_MINUTES_AFTER_ARRIVAL = 10;

// A REQUESTED ride with no accept for this long has exhausted matching —
// every nearby driver either rejected it or none were ever found, and
// without this the passenger's only way out is noticing and cancelling
// manually. An ACCEPTED ride that never reaches ARRIVED for this long means
// the driver went dark (crash, dead battery, disconnected) after
// committing — same dead end, different point in the flow.
const REQUESTED_TIMEOUT_MINUTES = 5;
const ACCEPTED_TIMEOUT_MINUTES = 15;
const ARRIVED_TIMEOUT_MINUTES = 15;

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/** The OTP exists so the *driver* has to hear it from the passenger in
 * person — sending it back in any response the driver can read defeats
 * the entire point, so it's stripped from every driver-facing view. */
function sanitizeRide(ride, viewerRole) {
  if (viewerRole === "PASSENGER") return ride;
  const { otpCode, ...rest } = ride;
  return rest;
}

/** Pre-acceptance ride offers show only what a driver needs to decide
 * whether to take the trip — not the passenger's phone number or full
 * name, which stay private until the driver has actually committed. */
function sanitizeRideOffer(ride, distanceKm) {
  const { otpCode, passenger, ...rest } = ride;
  return {
    ...rest,
    distanceKm,
    passenger: { firstName: passenger.user.firstName, rating: passenger.averageRating },
  };
}

async function getOwnPassenger(userId) {
  const passenger = await passengerRepository.findByUserId(userId);
  if (!passenger) throw ApiError.forbidden("Only passenger accounts can perform this action");
  return passenger;
}

async function getOwnDriver(userId) {
  const driver = await driverRepository.findByUserId(userId);
  if (!driver) throw ApiError.forbidden("Only driver accounts can perform this action");
  return driver;
}

async function getAssignedRideInStatus(userId, rideId, expectedStatus) {
  const driver = await getOwnDriver(userId);
  const ride = await rideRepository.findById(rideId);

  if (!ride || ride.driverId !== driver.id) {
    throw ApiError.notFound("Ride not found");
  }
  if (ride.status !== expectedStatus) {
    throw ApiError.conflict(`Ride must be in ${expectedStatus} status for this action`);
  }

  return { driver, ride };
}

// ---------------------------------------------------------------------------
// Passenger actions
// ---------------------------------------------------------------------------

export async function requestRide(userId, data) {
  const passenger = await getOwnPassenger(userId);

  const existing = await rideRepository.findActiveByPassenger(passenger.id);
  if (existing) {
    throw ApiError.conflict("You already have an active ride in progress");
  }

  const pickup = { lat: data.pickupLat, lng: data.pickupLng };
  const dropoff = { lat: data.dropoffLat, lng: data.dropoffLng };
  const route = await mapsService.computeRoute(pickup, dropoff);
  const fare = estimateFare(route.distanceMeters, route.durationSeconds, data.requestedVehicleType);

  const ride = await rideRepository.create({
    passengerId: passenger.id,
    requestedVehicleType: data.requestedVehicleType,
    pickupAddress: data.pickupAddress,
    pickupLat: data.pickupLat,
    pickupLng: data.pickupLng,
    dropoffAddress: data.dropoffAddress,
    dropoffLat: data.dropoffLat,
    dropoffLng: data.dropoffLng,
    routePolyline: route.polyline,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    otpCode: generateOtp(),
    estimatedFare: fare.amount,
    currency: fare.currency,
  });

  await rideStatusLogRepository.record(ride.id, "REQUESTED");
  await geoService.addPendingRide(ride.id, data.pickupLat, data.pickupLng);
  await dispatchRideOffer(ride);

  return ride;
}

/**
 * Push notification is a best-effort convenience on top of pull-based
 * polling, not a replacement for it — a driver whose socket is
 * disconnected (or who's on a version of the app predating push) still
 * finds this ride via GET /rides/nearby. If this dispatch silently
 * reaches zero drivers (all offline, all rejected already, whatever),
 * the ride simply stays REQUESTED and discoverable, exactly as it would
 * have without this function existing at all.
 *
 * N+1 driver lookups here (one per nearby candidate) is fine at demo
 * scale; a production dispatcher would batch this into a single query
 * against `geo:drivers:online` results.
 */
async function dispatchRideOffer(ride) {
  const nearby = await geoService.findNearbyOnlineDrivers(
    ride.pickupLat,
    ride.pickupLng,
    DEFAULT_SEARCH_RADIUS_KM
  );
  if (nearby.length === 0) return;

  const distanceById = new Map(nearby.map((n) => [n.id, n.distanceKm]));
  const candidates = await Promise.all(
    nearby.map((n) => driverRepository.findByIdForDispatch(n.id))
  );

  const offer = sanitizeRideOffer(ride, 0);

  for (const driver of candidates) {
    const eligible =
      driver &&
      driver.isOnline &&
      driver.isAvailable &&
      driver.verificationStatus === "APPROVED" &&
      driver.vehicles.some((v) => v.type === ride.requestedVehicleType);

    if (eligible) {
      emitToUser(driver.userId, "ride:offer", {
        ...offer,
        distanceKm: distanceById.get(driver.id),
      });
    }
  }
}

export async function getRide(userId, userRole, rideId) {
  const ride = await rideRepository.findById(rideId);
  if (!ride) throw ApiError.notFound("Ride not found");

  const isPassenger = ride.passenger.userId === userId;
  const isDriver = ride.driver?.userId === userId;

  // 404, not 403, for a ride that exists but isn't yours — don't confirm
  // the id refers to a real ride to someone uninvolved in it.
  if (!isPassenger && !isDriver && userRole !== "ADMIN") {
    throw ApiError.notFound("Ride not found");
  }

  return sanitizeRide(ride, isPassenger ? "PASSENGER" : "DRIVER");
}

export async function listPassengerHistory(userId, { page, limit, status }) {
  const passenger = await getOwnPassenger(userId);

  const [rides, total] = await Promise.all([
    rideRepository.listByPassenger({ passengerId: passenger.id, page, limit, status }),
    rideRepository.countByPassenger({ passengerId: passenger.id, status }),
  ]);

  return { rides, pagination: paginationMeta(page, limit, total) };
}

// ---------------------------------------------------------------------------
// Driver: discovery and matching (pull-based — see README for why)
// ---------------------------------------------------------------------------

export async function listNearby(userId, { lat, lng, radiusKm = DEFAULT_SEARCH_RADIUS_KM }) {
  const driver = await getOwnDriver(userId);

  if (!driver.isOnline || !driver.isAvailable || driver.verificationStatus !== "APPROVED") {
    return [];
  }

  const vehicles = await vehicleRepository.listActiveVerifiedByDriver(driver.id);
  const eligibleTypes = new Set(vehicles.map((v) => v.type));
  if (eligibleTypes.size === 0) return [];

  const nearby = await geoService.findNearbyPendingRides(lat, lng, radiusKm);
  if (nearby.length === 0) return [];

  const distanceById = new Map(nearby.map((n) => [n.id, n.distanceKm]));
  const rides = await rideRepository.findManyByIds(nearby.map((n) => n.id));

  const candidates = rides.filter(
    (ride) =>
      ride.status === "REQUESTED" && !ride.driverId && eligibleTypes.has(ride.requestedVehicleType)
  );

  const withRejectionFlag = await Promise.all(
    candidates.map(async (ride) => ({
      ride,
      rejected: await geoService.isRejectedByDriver(ride.id, driver.id),
    }))
  );

  return withRejectionFlag
    .filter(({ rejected }) => !rejected)
    .map(({ ride }) => sanitizeRideOffer(ride, distanceById.get(ride.id)))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function acceptRide(userId, rideId) {
  const driver = await getOwnDriver(userId);

  if (driver.verificationStatus !== "APPROVED") {
    throw ApiError.forbidden("Your driver account is not yet approved");
  }
  if (!driver.isOnline || !driver.isAvailable) {
    throw ApiError.badRequest("Go online and be available before accepting rides");
  }

  const activeRide = await rideRepository.findActiveByDriver(driver.id);
  if (activeRide) {
    throw ApiError.conflict("You already have an active ride");
  }

  const ride = await rideRepository.findById(rideId);
  if (!ride || ride.status !== "REQUESTED") {
    throw ApiError.conflict("Ride is no longer available");
  }

  const vehicle = await vehicleRepository.findActiveVerifiedByDriverAndType(
    driver.id,
    ride.requestedVehicleType
  );
  if (!vehicle) {
    throw ApiError.badRequest(`A verified ${ride.requestedVehicleType} is required to accept this ride`);
  }

  const result = await rideRepository.tryAssignDriver(rideId, driver.id, vehicle.id);
  if (result.count === 0) {
    throw ApiError.conflict("Ride is no longer available — another driver already accepted it");
  }

  await driverRepository.setAvailable(driver.id, false);
  await geoService.removePendingRide(rideId);
  await rideStatusLogRepository.record(rideId, "ACCEPTED");

  const updated = await rideRepository.findById(rideId);
  emitToUser(updated.passenger.userId, "ride:accepted", sanitizeRide(updated, "PASSENGER"));
  return sanitizeRide(updated, "DRIVER");
}

export async function rejectRide(userId, rideId) {
  const driver = await getOwnDriver(userId);
  await geoService.recordRejection(rideId, driver.id);
}

export async function markArrived(userId, rideId) {
  const { ride } = await getAssignedRideInStatus(userId, rideId, "ACCEPTED");

  const updated = await rideRepository.updateStatus(ride.id, {
    status: "ARRIVED",
    arrivedAt: new Date(),
  });
  await rideStatusLogRepository.record(ride.id, "ARRIVED");
  emitToUser(updated.passenger.userId, "ride:arrived", sanitizeRide(updated, "PASSENGER"));
  return sanitizeRide(updated, "DRIVER");
}

/**
 * Caps total attempts (not just failures) at 5 within a 15-minute window —
 * a 4-digit OTP has only 9000 possible values, so an unlimited number of
 * online guesses would make it trivially brute-forceable regardless of how
 * "random" the code is. The counter, not the code's entropy, is what makes
 * this safe.
 */
export async function startRide(userId, rideId, otpCode) {
  const { ride } = await getAssignedRideInStatus(userId, rideId, "ARRIVED");

  const otpAgeMinutes = (Date.now() - new Date(ride.arrivedAt).getTime()) / 60000;
  if (otpAgeMinutes > OTP_VALIDITY_MINUTES_AFTER_ARRIVAL) {
    throw ApiError.badRequest(
      "This OTP has expired. Ask the passenger to cancel and request a new ride."
    );
  }

  const attemptsKey = `ride:${rideId}:otpAttempts`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, OTP_ATTEMPT_WINDOW_SECONDS);

  if (attempts > MAX_OTP_ATTEMPTS) {
    throw ApiError.forbidden("Too many incorrect OTP attempts. Ask the passenger to cancel and re-request.");
  }
  if (otpCode !== ride.otpCode) {
    throw ApiError.badRequest("Incorrect OTP");
  }

  await redis.del(attemptsKey);

  const updated = await rideRepository.updateStatus(ride.id, {
    status: "IN_PROGRESS",
    startedAt: new Date(),
    otpVerifiedAt: new Date(),
  });
  await rideStatusLogRepository.record(ride.id, "IN_PROGRESS");
  emitToUser(updated.passenger.userId, "ride:started", sanitizeRide(updated, "PASSENGER"));
  return sanitizeRide(updated, "DRIVER");
}

/**
 * actualFare = estimatedFare is a deliberate MVP simplification: without a
 * live GPS trail (arriving in the Real-Time phase) there's no route-vs-
 * actual deviation to bill for. The Payments phase reads actualFare off a
 * COMPLETED ride to charge it — recomputing it here, once, is where that
 * logic will plug in later without changing anything downstream.
 */
export async function completeRide(userId, rideId) {
  const { driver, ride } = await getAssignedRideInStatus(userId, rideId, "IN_PROGRESS");

  const [updatedRide] = await prisma.$transaction([
    rideRepository.updateStatus(ride.id, {
      status: "COMPLETED",
      completedAt: new Date(),
      actualFare: ride.estimatedFare,
    }),
    driverRepository.setAvailable(driver.id, true),
    driverRepository.incrementCompletedRideStats(driver.id, ride.estimatedFare),
    passengerRepository.incrementCompletedRideStats(ride.passengerId),
  ]);

  await rideStatusLogRepository.record(ride.id, "COMPLETED");
  rideOutcomesTotal.inc({ outcome: "completed" });
  emitToUser(updatedRide.passenger.userId, "ride:completed", sanitizeRide(updatedRide, "PASSENGER"));
  return sanitizeRide(updatedRide, "DRIVER");
}

export async function cancelRide(userId, rideId, reason) {
  const ride = await rideRepository.findById(rideId);
  if (!ride) throw ApiError.notFound("Ride not found");

  let cancelledBy;
  if (ride.passenger.userId === userId) cancelledBy = "PASSENGER";
  else if (ride.driver?.userId === userId) cancelledBy = "DRIVER";
  else throw ApiError.notFound("Ride not found");

  if (!CANCELLABLE_STATUSES.includes(ride.status)) {
    throw ApiError.conflict(`A ride in ${ride.status} status cannot be cancelled`);
  }

  // Status flip and freeing up the driver must land together — a crash
  // between the two would otherwise leave a driver permanently stuck
  // `isAvailable: false` with no ride to ever complete and re-free them.
  const [updated] = await prisma.$transaction([
    rideRepository.updateStatus(ride.id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy,
      cancellationReason: reason,
    }),
    ...(ride.driverId ? [driverRepository.setAvailable(ride.driverId, true)] : []),
  ]);

  // Redis cleanup is best-effort outside the transaction — a stale pending-
  // ride entry surviving a crash here is a harmless, self-healing artifact
  // (it just means one extra candidate briefly considered in matching),
  // unlike the driver-availability flip above which has no self-healing path.
  await geoService.removePendingRide(ride.id);
  await rideStatusLogRepository.record(ride.id, "CANCELLED", reason ? { reason } : undefined);
  rideOutcomesTotal.inc({ outcome: "cancelled" });

  // Notify whichever side didn't do the cancelling — the initiator already
  // has the answer from this call's own REST response.
  if (cancelledBy === "PASSENGER" && updated.driver) {
    emitToUser(updated.driver.userId, "ride:cancelled", sanitizeRide(updated, "DRIVER"));
  } else if (cancelledBy === "DRIVER") {
    emitToUser(updated.passenger.userId, "ride:cancelled", sanitizeRide(updated, "PASSENGER"));
  }

  return sanitizeRide(updated, cancelledBy);
}

/**
 * Runs on a schedule (see jobs/processors/cleanup.processor.js) so a stuck
 * ride resolves itself instead of leaving a passenger or driver stranded
 * indefinitely with no system-driven exit. Each cancellation is guarded by
 * a conditional UPDATE keyed on the status this job observed, so a ride
 * that legitimately transitions between the query and the write (accepted,
 * cancelled, marked arrived) is simply skipped rather than incorrectly
 * cancelled out from under whoever just acted on it.
 */
export async function expireStaleRides() {
  const now = Date.now();
  const requestedCutoff = new Date(now - REQUESTED_TIMEOUT_MINUTES * 60 * 1000);
  const acceptedCutoff = new Date(now - ACCEPTED_TIMEOUT_MINUTES * 60 * 1000);
  const arrivedCutoff = new Date(now - ARRIVED_TIMEOUT_MINUTES * 60 * 1000);

  const [staleRequested, staleAccepted, staleArrived] = await Promise.all([
    rideRepository.findStaleRequested(requestedCutoff),
    rideRepository.findStaleAccepted(acceptedCutoff),
    rideRepository.findStaleArrived(arrivedCutoff),
  ]);

  let expiredCount = 0;

  for (const ride of staleRequested) {
    const reason = `No driver accepted within ${REQUESTED_TIMEOUT_MINUTES} minutes`;
    const result = await rideRepository.tryUpdateStatusIfCurrently(ride.id, "REQUESTED", {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: "SYSTEM",
      cancellationReason: reason,
    });
    if (result.count === 0) continue;

    await geoService.removePendingRide(ride.id);
    await rideStatusLogRepository.record(ride.id, "CANCELLED", { reason });
    rideOutcomesTotal.inc({ outcome: "expired" });
    emitToUser(ride.passenger.userId, "ride:cancelled", sanitizeRide({ ...ride, status: "CANCELLED" }, "PASSENGER"));
    expiredCount++;
  }

  for (const ride of staleAccepted) {
    const reason = `Driver did not arrive within ${ACCEPTED_TIMEOUT_MINUTES} minutes of accepting`;
    const [result] = await prisma.$transaction([
      rideRepository.tryUpdateStatusIfCurrently(ride.id, "ACCEPTED", {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "SYSTEM",
        cancellationReason: reason,
      }),
      ...(ride.driverId ? [driverRepository.setAvailable(ride.driverId, true)] : []),
    ]);
    if (result.count === 0) continue;

    await rideStatusLogRepository.record(ride.id, "CANCELLED", { reason });
    rideOutcomesTotal.inc({ outcome: "expired" });
    emitToUser(ride.passenger.userId, "ride:cancelled", sanitizeRide({ ...ride, status: "CANCELLED" }, "PASSENGER"));
    if (ride.driver) {
      emitToUser(ride.driver.userId, "ride:cancelled", sanitizeRide({ ...ride, status: "CANCELLED" }, "DRIVER"));
    }
    expiredCount++;
  }

  for (const ride of staleArrived) {
    const reason = `OTP was never completed within ${ARRIVED_TIMEOUT_MINUTES} minutes of driver arrival`;
    const [result] = await prisma.$transaction([
      rideRepository.tryUpdateStatusIfCurrently(ride.id, "ARRIVED", {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "SYSTEM",
        cancellationReason: reason,
      }),
      ...(ride.driverId ? [driverRepository.setAvailable(ride.driverId, true)] : []),
    ]);
    if (result.count === 0) continue;

    await rideStatusLogRepository.record(ride.id, "CANCELLED", { reason });
    rideOutcomesTotal.inc({ outcome: "expired" });
    emitToUser(ride.passenger.userId, "ride:cancelled", sanitizeRide({ ...ride, status: "CANCELLED" }, "PASSENGER"));
    if (ride.driver) {
      emitToUser(ride.driver.userId, "ride:cancelled", sanitizeRide({ ...ride, status: "CANCELLED" }, "DRIVER"));
    }
    expiredCount++;
  }

  return {
    expiredRequested: staleRequested.length,
    expiredAccepted: staleAccepted.length,
    expiredArrived: staleArrived.length,
    expiredCount,
  };
}

/**
 * Called on socket (re)connect so a client that missed events while
 * disconnected — a status change, a cancellation — gets resynced with
 * where the ride actually stands instead of only ever hearing about
 * *future* events. Without this, a client relying solely on socket
 * pushes has no way to notice it missed something during a dropped
 * connection; it would just keep showing stale state until the user
 * happens to trigger a REST refetch some other way.
 */
export async function getMyActiveRide(userId) {
  const [passenger, driver] = await Promise.all([
    passengerRepository.findByUserId(userId),
    driverRepository.findByUserId(userId),
  ]);

  const [asPassenger, asDriver] = await Promise.all([
    passenger ? rideRepository.findActiveByPassenger(passenger.id) : null,
    driver ? rideRepository.findActiveByDriver(driver.id) : null,
  ]);

  const lean = asPassenger ?? asDriver;
  if (!lean) return null;

  const full = await rideRepository.findById(lean.id);
  return sanitizeRide(full, asPassenger ? "PASSENGER" : "DRIVER");
}

export async function listDriverHistory(userId, { page, limit, status }) {
  const driver = await getOwnDriver(userId);

  const [rides, total] = await Promise.all([
    rideRepository.listByDriver({ driverId: driver.id, page, limit, status }),
    rideRepository.countByDriver({ driverId: driver.id, status }),
  ]);

  return {
    rides: rides.map((r) => sanitizeRide(r, "DRIVER")),
    pagination: paginationMeta(page, limit, total),
  };
}
