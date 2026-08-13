import { describe, it, expect, afterAll } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { closeAppConnections } from "../helpers/teardown.js";

/**
 * Imports `app.js` directly, not `server.js` — Supertest drives the
 * Express app in-process without an actual open port, and this app has no
 * need for the socket/job bootstrapping server.js also does. That
 * separation (kept since Phase 1 specifically so app.js has no side
 * effects on import) is what makes this test simple at all.
 */
afterAll(closeAppConnections);

describe("GET /health", () => {
  it("reports 200 with both dependencies up against real Postgres and Redis", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.data.services).toEqual({ database: "up", redis: "up" });
  });
});
