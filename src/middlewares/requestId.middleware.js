import { randomUUID } from "node:crypto";

/**
 * A request-scoped id, threaded through the access log line, the error
 * log line, and the response's own `X-Request-Id` header. Without this,
 * correlating "which request caused this error log entry" or "why is this
 * one client-reported request slow" across a log aggregator meant
 * cross-referencing by timestamp and hoping nothing else happened in the
 * same second — this makes it a single grep instead.
 *
 * Trusts an inbound `X-Request-Id` when present (a load balancer or an
 * upstream service may already have assigned one) so a request's id stays
 * consistent across hops instead of getting a new one at every service
 * boundary; generates a fresh UUID otherwise.
 */
export function requestId(req, res, next) {
  req.id = req.headers["x-request-id"] || randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
