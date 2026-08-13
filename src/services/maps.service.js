import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { haversineDistanceMeters } from "../utils/geo.util.js";

const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

// Straight-line distance always understates actual road distance — this
// rough multiplier (and a flat urban-average speed for duration) is only
// ever used when GOOGLE_MAPS_API_KEY isn't configured, so local dev and
// tests don't require a billed Google API key to exercise the ride flow.
const ROAD_DISTANCE_FACTOR = 1.3;
const AVERAGE_SPEED_KMH = 30;

function haversineFallback(pickup, dropoff) {
  const distanceMeters = haversineDistanceMeters(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng) * ROAD_DISTANCE_FACTOR;
  const durationSeconds = (distanceMeters / 1000 / AVERAGE_SPEED_KMH) * 3600;
  return { distanceMeters: Math.round(distanceMeters), durationSeconds: Math.round(durationSeconds), polyline: null };
}

async function googleDirections(pickup, dropoff) {
  const url = new URL(DIRECTIONS_URL);
  url.searchParams.set("origin", `${pickup.lat},${pickup.lng}`);
  url.searchParams.set("destination", `${dropoff.lat},${dropoff.lng}`);
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK" || !data.routes.length) {
    throw new Error(`Google Directions API returned status: ${data.status}`);
  }

  const leg = data.routes[0].legs[0];
  return {
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
    polyline: data.routes[0].overview_polyline?.points ?? null,
  };
}

/**
 * Route/distance/ETA for a pickup -> dropoff pair. Falls back to a
 * Haversine estimate both when no API key is configured and when the
 * Google call itself fails — a ride request shouldn't hard-fail because a
 * third-party API had a bad moment; it should degrade to a rougher fare
 * estimate instead.
 */
export async function computeRoute(pickup, dropoff) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return haversineFallback(pickup, dropoff);
  }

  try {
    return await googleDirections(pickup, dropoff);
  } catch (err) {
    logger.error("Google Directions API call failed, using Haversine fallback", {
      error: err.message,
    });
    return haversineFallback(pickup, dropoff);
  }
}
