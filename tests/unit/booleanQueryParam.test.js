import { describe, it, expect } from "@jest/globals";
import { z } from "zod";
import { booleanQueryParam } from "../../src/validators/common.validator.js";

/**
 * Regression test for a real bug found while testing Phase 9:
 * `z.coerce.boolean()` runs `Boolean(str)`, and `Boolean("false")` is
 * `true` — any non-empty string is truthy in JavaScript. That silently
 * broke `?isActive=false`/`?isRead=false` filters in three places across
 * three phases before anyone tested the `false` case specifically.
 */
describe("booleanQueryParam", () => {
  const schema = z.object({ isActive: booleanQueryParam.optional() });

  it('parses the literal string "false" as false', () => {
    expect(schema.parse({ isActive: "false" }).isActive).toBe(false);
  });

  it('parses the literal string "true" as true', () => {
    expect(schema.parse({ isActive: "true" }).isActive).toBe(true);
  });

  it("rejects anything that isn't exactly \"true\" or \"false\"", () => {
    expect(() => schema.parse({ isActive: "yes" })).toThrow();
    expect(() => schema.parse({ isActive: "0" })).toThrow();
  });

  it("stays undefined when omitted (no filter applied)", () => {
    expect(schema.parse({}).isActive).toBeUndefined();
  });
});
