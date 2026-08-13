import { describe, it, expect, afterAll } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { uniqueEmail, deleteTestUser } from "../helpers/factories.js";
import { closeAppConnections } from "../helpers/teardown.js";

afterAll(closeAppConnections);

const VALID_PASSWORD = "Passw0rd123";

describe("Auth API (Supertest, real app + real Postgres/Redis)", () => {
  describe("POST /api/v1/auth/register", () => {
    it("creates a passenger account and returns a session", async () => {
      const email = uniqueEmail("register");

      const res = await request(app).post("/api/v1/auth/register").send({
        email,
        password: VALID_PASSWORD,
        firstName: "Api",
        lastName: "Test",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user.role).toBe("PASSENGER");
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      // The whole point of sanitizeUser — this must never appear in a response.
      expect(res.body.data.user.passwordHash).toBeUndefined();

      await deleteTestUser(res.body.data.user.id);
    });

    it("rejects a duplicate email with 409", async () => {
      const email = uniqueEmail("dupe");
      const first = await request(app)
        .post("/api/v1/auth/register")
        .send({ email, password: VALID_PASSWORD, firstName: "A", lastName: "B" });

      const second = await request(app)
        .post("/api/v1/auth/register")
        .send({ email, password: VALID_PASSWORD, firstName: "C", lastName: "D" });

      expect(second.status).toBe(409);

      await deleteTestUser(first.body.data.user.id);
    });

    it("rejects a password that fails the complexity policy with 400", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        email: uniqueEmail("weak"),
        password: "weak",
        firstName: "A",
        lastName: "B",
      });

      expect(res.status).toBe(400);
      expect(res.body.details.body).toEqual(expect.arrayContaining([expect.any(String)]));
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("logs in with correct credentials", async () => {
      const email = uniqueEmail("login");
      const reg = await request(app)
        .post("/api/v1/auth/register")
        .send({ email, password: VALID_PASSWORD, firstName: "A", lastName: "B" });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: VALID_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));

      await deleteTestUser(reg.body.data.user.id);
    });

    it("returns the same generic 401 for a wrong password as for a nonexistent email", async () => {
      const email = uniqueEmail("wrongpw");
      const reg = await request(app)
        .post("/api/v1/auth/register")
        .send({ email, password: VALID_PASSWORD, firstName: "A", lastName: "B" });

      const wrongPassword = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: "WrongPassw0rd1" });
      const noSuchEmail = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: uniqueEmail("ghost"), password: VALID_PASSWORD });

      expect(wrongPassword.status).toBe(401);
      expect(noSuchEmail.status).toBe(401);
      expect(wrongPassword.body.message).toBe(noSuchEmail.body.message);

      await deleteTestUser(reg.body.data.user.id);
    });
  });

  describe("GET /api/v1/users/me (protected route)", () => {
    it("rejects a request with no access token", async () => {
      const res = await request(app).get("/api/v1/users/me");
      expect(res.status).toBe(401);
    });

    it("rejects a garbage/invalid access token", async () => {
      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });

    it("returns the profile for a valid access token", async () => {
      const email = uniqueEmail("me");
      const reg = await request(app)
        .post("/api/v1/auth/register")
        .send({ email, password: VALID_PASSWORD, firstName: "Profile", lastName: "Test" });

      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${reg.body.data.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(email);

      await deleteTestUser(reg.body.data.user.id);
    });
  });
});
