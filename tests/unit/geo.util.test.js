import { describe, it, expect } from "@jest/globals";
import { haversineDistanceMeters } from "../../src/utils/geo.util.js";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceMeters(37.7749, -122.4194, 37.7749, -122.4194)).toBe(0);
  });

  it("matches the known distance between SF and LA within 1% (~559km great-circle)", () => {
    const sf = [37.7749, -122.4194];
    const la = [34.0522, -118.2437];
    const distanceKm = haversineDistanceMeters(...sf, ...la) / 1000;

    expect(distanceKm).toBeGreaterThan(553);
    expect(distanceKm).toBeLessThan(565);
  });

  it("is symmetric — order of points doesn't matter", () => {
    const a = haversineDistanceMeters(37.7749, -122.4194, 37.7694, -122.4862);
    const b = haversineDistanceMeters(37.7694, -122.4862, 37.7749, -122.4194);
    expect(a).toBeCloseTo(b, 5);
  });
});
