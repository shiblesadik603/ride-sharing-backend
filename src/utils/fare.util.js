import { PRICING } from "../config/pricing.js";

export function estimateFare(distanceMeters, durationSeconds, vehicleType) {
  const rate = PRICING[vehicleType];
  const distanceKm = distanceMeters / 1000;
  const durationMin = durationSeconds / 60;

  const fare = rate.baseFare + rate.perKm * distanceKm + rate.perMin * durationMin;

  // Never below the base fare, regardless of how short the trip is.
  return { amount: Math.max(fare, rate.baseFare).toFixed(2), currency: rate.currency };
}
