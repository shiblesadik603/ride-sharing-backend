import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken } from "../services/token.service.js";

/**
 * Populates req.user = { id, role } from a Bearer access token. Only the
 * JWT signature is checked here — no DB hit, which is the entire point of
 * using a stateless token for the high-frequency "is this request
 * authenticated" check on every protected route.
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Access token is required");
  }

  const payload = verifyAccessToken(header.slice("Bearer ".length));
  req.user = { id: payload.sub, role: payload.role };
  next();
}

/**
 * RBAC guard for role-restricted routes (e.g. admin-only endpoints).
 * Must run after `authenticate`. Real per-role feature checks (e.g. "is this
 * driver verified") belong in the relevant service, not here — this only
 * answers "is this account's role allowed to call this route at all".
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized("Access token is required");
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden("You do not have permission to perform this action");
    }
    next();
  };
}
