import { describe, it, expect } from "@jest/globals";
import { ApiError } from "../../src/utils/ApiError.js";

describe("ApiError", () => {
  it.each([
    ["badRequest", 400],
    ["unauthorized", 401],
    ["forbidden", 403],
    ["notFound", 404],
    ["conflict", 409],
    ["internal", 500],
  ])("%s() sets statusCode %i", (factory, statusCode) => {
    const err = ApiError[factory]("message");
    expect(err.statusCode).toBe(statusCode);
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it("carries an optional details payload for field-level validation errors", () => {
    const err = ApiError.badRequest("Validation failed", { email: ["Invalid email"] });
    expect(err.details).toEqual({ email: ["Invalid email"] });
  });

  it("defaults conflict()'s message to what's passed, with no silent fallback", () => {
    const err = ApiError.conflict("Ride already paid for");
    expect(err.message).toBe("Ride already paid for");
  });
});
