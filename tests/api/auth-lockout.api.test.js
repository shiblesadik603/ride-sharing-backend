import { describe, it, expect, afterAll } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { redis } from "../../src/config/redis.js";
import { uniqueEmail, deleteTestUser } from "../helpers/factories.js";
import { closeAppConnections } from "../helpers/teardown.js";

afterAll(closeAppConnections);

const VALID_PASSWORD = "Passw0rd123";

/**
 * Covers the production-hardening pass's account-level login lockout,
 * caught by manual curl testing, not by any automated test at the time —
 * this file exists so the next change to auth.service.js can't silently
 * regress it. Split into its own file (not combined with logout-all)
 * specifically to stay under loginLimiter's 10-requests/15min budget:
 * register() shares that limiter with login(), and Jest's
 * --experimental-vm-modules gives each test *file* its own isolated
 * module registry — and therefore its own fresh rate-limiter counter —
 * so this file's requests don't compete with any other file's budget.
 */
describe("Account-level login lockout (Supertest, real app + real Postgres/Redis)", () => {
  it("locks out further attempts after 5 failed logins, even with the correct password", async () => {
    const email = uniqueEmail("lockout");
    const reg = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: VALID_PASSWORD, firstName: "Lock", lastName: "Out" });
    expect(reg.status).toBe(201);

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: "WrongPassword1" });
      expect(res.status).toBe(401);
    }

    // The 6th attempt, this time with the CORRECT password, must still
    // be blocked — the lockout is per-account, not "still guessing."
    const blocked = await request(app).post("/api/v1/auth/login").send({ email, password: VALID_PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/too many failed login attempts/i);

    // Clean up the lockout key so this test is independently repeatable
    // and doesn't leak state into a rerun within the same TTL window.
    await redis.del(`auth:failedLogin:${email.toLowerCase()}`);
    await deleteTestUser(reg.body.data.user.id);
  });

  it("a successful login resets the counter", async () => {
    const email = uniqueEmail("lockout-reset");
    const reg = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: VALID_PASSWORD, firstName: "Reset", lastName: "Test" });

    // One failure, then a real success — should not be blocked, and
    // should clear the counter so a *subsequent* mistake starts fresh.
    await request(app).post("/api/v1/auth/login").send({ email, password: "wrong1" });
    const success = await request(app).post("/api/v1/auth/login").send({ email, password: VALID_PASSWORD });
    expect(success.status).toBe(200);

    const attempts = await redis.get(`auth:failedLogin:${email.toLowerCase()}`);
    expect(attempts).toBeNull();

    await deleteTestUser(reg.body.data.user.id);
  });
});
