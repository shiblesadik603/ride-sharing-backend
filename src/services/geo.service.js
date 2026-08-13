import { redis } from "../config/redis.js";

/**
 * Two Redis geosets, both ephemeral (rebuilt from live driver/ride state,
 * never the source of truth): `geo:drivers:online` backs push-dispatch —
 * "who's near this new ride request" — as well as GET /rides/nearby's
 * driver-side polling fallback. `geo:rides:pending` is the reverse query,
 * a driver's own position searched against pending ride requests.
 * Postgres is never asked "what's near X" directly; geo queries always go
 * through Redis first.
 */
const DRIVERS_ONLINE_KEY = "geo:drivers:online";
const RIDES_PENDING_KEY = "geo:rides:pending";

export function setDriverLocation(driverId, lat, lng) {
  return redis.geoadd(DRIVERS_ONLINE_KEY, lng, lat, driverId);
}

export function removeDriverLocation(driverId) {
  return redis.zrem(DRIVERS_ONLINE_KEY, driverId);
}

export function addPendingRide(rideId, lat, lng) {
  return redis.geoadd(RIDES_PENDING_KEY, lng, lat, rideId);
}

export function removePendingRide(rideId) {
  return redis.zrem(RIDES_PENDING_KEY, rideId);
}

/** Returns [{ id, distanceKm }], nearest first. */
export async function findNearbyPendingRides(lat, lng, radiusKm) {
  const results = await redis.geosearch(
    RIDES_PENDING_KEY,
    "FROMLONLAT",
    lng,
    lat,
    "BYRADIUS",
    radiusKm,
    "km",
    "ASC",
    "WITHDIST"
  );
  return results.map(([id, distanceKm]) => ({ id, distanceKm: Number(distanceKm) }));
}

/** Returns [{ id, distanceKm }], nearest first — used to proactively
 * dispatch a new ride request to nearby online drivers. */
export async function findNearbyOnlineDrivers(lat, lng, radiusKm) {
  const results = await redis.geosearch(
    DRIVERS_ONLINE_KEY,
    "FROMLONLAT",
    lng,
    lat,
    "BYRADIUS",
    radiusKm,
    "km",
    "ASC",
    "WITHDIST"
  );
  return results.map(([id, distanceKm]) => ({ id, distanceKm: Number(distanceKm) }));
}

const REJECTION_TTL_SECONDS = 60 * 60;

export async function recordRejection(rideId, driverId) {
  const key = `ride:${rideId}:rejectedBy`;
  await redis.sadd(key, driverId);
  await redis.expire(key, REJECTION_TTL_SECONDS);
}

export async function isRejectedByDriver(rideId, driverId) {
  return (await redis.sismember(`ride:${rideId}:rejectedBy`, driverId)) === 1;
}
