import { describe, it, expect, afterAll } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { uniqueEmail, deleteTestUser } from "../helpers/factories.js";
import { closeAppConnections } from "../helpers/teardown.js";

afterAll(closeAppConnections);

const VALID_PASSWORD = "Passw0rd123";

/**
 * Covers the production-hardening pass's "logout everywhere" endpoint —
 * previously only reachable as a side effect of a password change. Split
 * into its own file (not combined with the lockout tests) so its
 * requests through loginLimiter (shared by register()) don't compete for
 * the same 10-requests/15min budget within one Jest module registry.
 */
describe("POST /api/v1/auth/logout-all (Supertest, real app + real Postgres/Redis)", () => {
  it("revokes the current access token immediately and the refresh token for future use", async () => {
    const email = uniqueEmail("logout-all");
    const reg = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: VALID_PASSWORD, firstName: "Logout", lastName: "All" });
    expect(reg.status).toBe(201);
    const { accessToken, refreshToken } = reg.body.data;

    const logoutAll = await request(app)
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(logoutAll.status).toBe(200);

    // The SAME access token, already issued, must stop working right
    // away — not just fail to renew once it naturally expires.
    const reuseAccessToken = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(reuseAccessToken.status).toBe(401);
    expect(reuseAccessToken.body.message).toMatch(/session has been revoked/i);

    // The refresh token must also be dead, not just the access token.
    const reuseRefreshToken = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });
    expect(reuseRefreshToken.status).toBe(401);

    await deleteTestUser(reg.body.data.user.id);
  });

  it("rejects a call with no access token", async () => {
    const res = await request(app).post("/api/v1/auth/logout-all");
    expect(res.status).toBe(401);
  });
});
