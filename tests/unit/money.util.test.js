import { describe, it, expect } from "@jest/globals";
import { toStripeCents, fromStripeCents } from "../../src/utils/money.util.js";

describe("money.util", () => {
  it("converts dollars to integer cents", () => {
    expect(toStripeCents(17.36)).toBe(1736);
    expect(toStripeCents(5)).toBe(500);
  });

  it("rounds sub-cent floating point noise instead of truncating", () => {
    // 0.1 + 0.2 is the classic float example; toStripeCents must not leak it
    expect(toStripeCents(0.1 + 0.2)).toBe(30);
  });

  it("converts cents back to a 2-decimal dollar amount", () => {
    expect(fromStripeCents(1736)).toBe(17.36);
    expect(fromStripeCents(500)).toBe(5);
  });

  it("round-trips without drift", () => {
    for (const amount of [0.5, 1, 9.99, 17.36, 100, 249.5]) {
      expect(fromStripeCents(toStripeCents(amount))).toBe(amount);
    }
  });
});
