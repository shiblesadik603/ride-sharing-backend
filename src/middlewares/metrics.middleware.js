import { httpRequestDuration, httpRequestsTotal } from "../config/metrics.js";

// Matches this project's cuid()-based ids (Prisma's default: "c" + 24
// base-36 chars, 25 total) and, defensively, any other long
// alphanumeric-looking path segment — catches an id even where `req.route`
// isn't available to give the *real* template (see below).
const ID_LIKE_SEGMENT = /^[a-zA-Z0-9_-]{20,}$/;

function sanitizePath(path) {
  return path
    .split("/")
    .map((segment) => (ID_LIKE_SEGMENT.test(segment) ? ":id" : segment))
    .join("/");
}

/**
 * Labels by route *pattern*, not the raw URL — labeling by raw URL would
 * let every distinct ride id ever requested mint a new label combination,
 * and Prometheus client libraries (this one included) hold every
 * combination in memory for the life of the process. That's the classic
 * "cardinality explosion" failure mode for this kind of metric.
 *
 * `req.route.path` (set by Express once a specific `router.METHOD(path)`
 * definition actually matches) is the reliable source when available. But
 * a request rejected by `router.use(authenticate)` or similar — upstream
 * of any specific route — never reaches that point, so `req.route` stays
 * unset and the raw URL (id included) is all there is. `sanitizePath`
 * closes that gap by pattern-matching id-shaped segments out of the raw
 * path in that fallback case, rather than trusting it verbatim.
 */
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : sanitizePath(req.baseUrl || req.path);
    const labels = { method: req.method, route, status_code: res.statusCode };

    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
}
