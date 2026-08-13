import { describe, it, expect } from "@jest/globals";
import { estimateFare } from "../../src/utils/fare.util.js";
import { PRICING } from "../../src/config/pricing.js";

describe("estimateFare", () => {
  it("computes base + distance + time components for a normal trip", () => {
    const result = estimateFare(5000, 600, "SEDAN"); // 5km, 10min
    const rate = PRICING.SEDAN;
    const expected = rate.baseFare + rate.perKm * 5 + rate.perMin * 10;

    expect(Number(result.amount)).toBeCloseTo(expected, 2);
    expect(result.currency).toBe(rate.currency);
  });

  it("never charges less than the base fare, even for a near-zero-distance trip", () => {
    const result = estimateFare(1, 1, "BIKE");
    expect(Number(result.amount)).toBeGreaterThanOrEqual(PRICING.BIKE.baseFare);
  });

  it("returns a string amount fixed to 2 decimal places", () => {
    const result = estimateFare(3333, 444, "AUTO");
    expect(result.amount).toMatch(/^\d+\.\d{2}$/);
  });

  it("prices each vehicle type independently", () => {
    const sedan = estimateFare(10000, 900, "SEDAN");
    const suv = estimateFare(10000, 900, "SUV");
    // SUV is configured strictly more expensive per km/min in pricing.js
    expect(Number(suv.amount)).toBeGreaterThan(Number(sedan.amount));
  });
});
