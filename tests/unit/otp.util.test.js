import { describe, it, expect } from "@jest/globals";
import { generateOtp } from "../../src/utils/otp.util.js";

describe("generateOtp", () => {
  it("always produces a 4-digit numeric string", () => {
    for (let i = 0; i < 200; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{4}$/);
      expect(Number(otp)).toBeGreaterThanOrEqual(1000);
      expect(Number(otp)).toBeLessThanOrEqual(9999);
    }
  });

  it("doesn't produce the same value every time (sanity check it's actually random)", () => {
    const values = new Set(Array.from({ length: 50 }, generateOtp));
    expect(values.size).toBeGreaterThan(1);
  });
});
