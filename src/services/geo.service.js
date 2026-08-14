import { redis } from "../config/redis.js";
import { logger } from "../config/logger.js";

/**
 * Every function below used to let a Redis error propagate straight up
 * as an unhandled rejection — a real request-request-response failure
 * (`config/redis.js`'s own retry cap being exhausted, a Redis outage) for
 * something that, in every case here, isn't actually essential to the
 * caller's larger operation succeeding. This wraps a Redis call with a
 * fallback value and a warning log instead of a thrown error, so a Redis
 * outage degrades matching/location features rather than 500ing requests
 * that don't strictly need Redis to complete (a ride was already created
 * in Postgres; a driver going online was already recorded there too).
 *
 * The fallback value matters and is chosen per call site, not just "always
 * return null" — see each usage below for why that specific value is the
 * *safe* direction to fail in, not just a convenient one.
 */
async function withRedisFallback(operation, fallback, context) {
  try {
    return await operation();
  } catch (err) {
    logger.warn("Redis operation failed, degrading gracefully", { context, error: err.message });
    return fallback;
  }
}

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

/**
 * Fail-soft, not fail-loud: by the time any of these run, the caller's
 * actual state change (driver row updated, ride row created/cancelled in
 * Postgres) has already committed — throwing here would fail the whole
 * request over a *secondary* system being briefly unavailable, leaving
 * Postgres and Redis inconsistent anyway (the DB write already happened)
 * while also handing the client a confusing 500 for what looks like a
 * successful action. Degraded matching (this driver isn't geo-discoverable
 * until Redis recovers, or this ride isn't proactively dispatched) is a
 * better failure mode than that, and it's self-healing — the next location
 * ping / the next matching query retries the same Redis call.
 */
export function setDriverLocation(driverId, lat, lng) {
  return withRedisFallback(
    () => redis.geoadd(DRIVERS_ONLINE_KEY, lng, lat, driverId),
    null,
    "setDriverLocation"
  );
}

export function removeDriverLocation(driverId) {
  return withRedisFallback(() => redis.zrem(DRIVERS_ONLINE_KEY, driverId), null, "removeDriverLocation");
}

export function addPendingRide(rideId, lat, lng) {
  return withRedisFallback(
    () => redis.geoadd(RIDES_PENDING_KEY, lng, lat, rideId),
    null,
    "addPendingRide"
  );
}

export function removePendingRide(rideId) {
  return withRedisFallback(() => redis.zrem(RIDES_PENDING_KEY, rideId), null, "removePendingRide");
}

/**
 * Returns [{ id, distanceKm }], nearest first — or an empty array if
 * Redis is unavailable. "No matches found" is a real, valid result these
 * callers already handle (an empty geoset area produces the exact same
 * shape); it's the correct degraded answer when the *matching system
 * itself* can't be reached, rather than surfacing that as a request
 * failure to a passenger requesting a ride or a driver polling for one.
 */
export async function findNearbyPendingRides(lat, lng, radiusKm) {
  const results = await withRedisFallback(
    () =>
      redis.geosearch(
        RIDES_PENDING_KEY,
        "FROMLONLAT",
        lng,
        lat,
        "BYRADIUS",
        radiusKm,
        "km",
        "ASC",
        "WITHDIST"
      ),
    [],
    "findNearbyPendingRides"
  );
  return results.map(([id, distanceKm]) => ({ id, distanceKm: Number(distanceKm) }));
}

/** Same reasoning as findNearbyPendingRides — used to proactively dispatch
 * a new ride request to nearby online drivers. */
export async function findNearbyOnlineDrivers(lat, lng, radiusKm) {
  const results = await withRedisFallback(
    () =>
      redis.geosearch(
        DRIVERS_ONLINE_KEY,
        "FROMLONLAT",
        lng,
        lat,
        "BYRADIUS",
        radiusKm,
        "km",
        "ASC",
        "WITHDIST"
      ),
    [],
    "findNearbyOnlineDrivers"
  );
  return results.map(([id, distanceKm]) => ({ id, distanceKm: Number(distanceKm) }));
}

/**
 * `geo:drivers:online` (a Redis sorted set) has no per-member expiry —
 * once a driver is GEOADD'd there, they stay discoverable forever until
 * something explicitly ZREMs them. A driver whose app crashes, whose
 * battery dies, or who drops off the network without ever calling
 * /me/offline would otherwise sit in the geoset (and in Postgres as
 * isOnline:true) indefinitely, matched into rides they can never take.
 *
 * This is the fix: a short-TTL heartbeat key refreshed on every location
 * ping and on going online. A scheduled sweep (driver.service.js /
 * expireStaleHeartbeats) compares Postgres's isOnline:true drivers against
 * which of these keys are still alive and force-offlines whoever's isn't —
 * the same "TTL as liveness signal" pattern used everywhere from Consul to
 * Kubernetes readiness probes, just backed by Redis EXPIRE instead of a
 * dedicated health-check protocol.
 */
const HEARTBEAT_TTL_SECONDS = 90;

export function refreshHeartbeat(driverId) {
  return withRedisFallback(
    () => redis.set(`driver:heartbeat:${driverId}`, "1", "EX", HEARTBEAT_TTL_SECONDS),
    null,
    "refreshHeartbeat"
  );
}

/**
 * Fails open to "has a heartbeat" (true), not "doesn't" — this is read by
 * the offline-sweep job to decide whether to force a driver offline. If
 * Redis itself is what's unavailable, that says nothing about whether the
 * driver is actually still connected; failing open means the sweep simply
 * skips everyone this pass rather than mass-force-offlining every online
 * driver because the *liveness check* broke, not because they actually
 * went dark. The next sweep, once Redis recovers, evaluates correctly.
 */
export async function hasHeartbeat(driverId) {
  return withRedisFallback(async () => (await redis.exists(`driver:heartbeat:${driverId}`)) === 1, true, "hasHeartbeat");
}

export function clearHeartbeat(driverId) {
  return withRedisFallback(() => redis.del(`driver:heartbeat:${driverId}`), null, "clearHeartbeat");
}

const REJECTION_TTL_SECONDS = 60 * 60;

export async function recordRejection(rideId, driverId) {
  return withRedisFallback(
    async () => {
      const key = `ride:${rideId}:rejectedBy`;
      await redis.sadd(key, driverId);
      await redis.expire(key, REJECTION_TTL_SECONDS);
    },
    null,
    "recordRejection"
  );
}

/**
 * Fails open to "not rejected" (false) — the safe direction here is the
 * opposite of hasHeartbeat's, but for the same underlying reason: when
 * the check itself can't run, assume the state that keeps the ride
 * visible to the driver rather than the state that hides it. Worst case
 * under a Redis outage, a driver briefly sees a ride they'd already
 * rejected again — mildly redundant, not incorrect or unsafe.
 */
export async function isRejectedByDriver(rideId, driverId) {
  return withRedisFallback(
    async () => (await redis.sismember(`ride:${rideId}:rejectedBy`, driverId)) === 1,
    false,
    "isRejectedByDriver"
  );
}
