import { describe, it, expect, jest } from "@jest/globals";
import { z } from "zod";
import { validate } from "../../src/middlewares/validate.middleware.js";

/**
 * Regression test for a real bug found while testing Phase 3: Express 5
 * made `req.query` a getter-only accessor (no setter) — `req.query = x`
 * throws `TypeError: Cannot set property query of #<IncomingMessage>
 * which has only a getter`. This mocks that exact shape (a getter with no
 * setter, matching Express 5's actual req.query implementation) to prove
 * the middleware's Object.defineProperty workaround still works, not just
 * that it happens to work against a plain mutable object.
 */
function makeExpress5StyleRequest({ body, query, params }) {
  const req = { body, params };
  Object.defineProperty(req, "query", {
    get: () => query,
    configurable: true,
    enumerable: true,
  });
  return req;
}

describe("validate middleware", () => {
  it("replaces a getter-only req.query without throwing", () => {
    const schema = z.object({
      query: z.object({ page: z.coerce.number().default(1) }),
    });
    const req = makeExpress5StyleRequest({ query: { page: "3" } });
    const next = jest.fn();

    expect(() => validate(schema)(req, {}, next)).not.toThrow();
    expect(req.query).toEqual({ page: 3 });
    expect(next).toHaveBeenCalledWith();
  });

  it("applies Zod defaults/coercion to query even when the schema omits body/params", () => {
    const schema = z.object({
      query: z.object({ limit: z.coerce.number().default(20) }),
    });
    const req = makeExpress5StyleRequest({ query: {} });
    const next = jest.fn();

    validate(schema)(req, {}, next);

    expect(req.query.limit).toBe(20);
  });

  it("forwards a ZodError synchronously on invalid input instead of calling next", () => {
    const schema = z.object({ body: z.object({ email: z.string().email() }) });
    const req = { body: { email: "not-an-email" }, params: {} };

    expect(() => validate(schema)(req, {}, () => {})).toThrow();
  });
});
