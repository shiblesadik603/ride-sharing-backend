import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken, isUserAccessRevoked } from "../services/token.service.js";

/**
 * Populates req.user = { id, role } from a Bearer access token. The JWT
 * signature check is still the primary, no-DB-hit authentication — the
 * revocation check added below is a single fast Redis lookup (not a DB
 * call), and only ever returns true in the narrow window right after a
 * ban/suspension/password reset (see token.service.js), so it doesn't
 * undermine the reason access tokens are stateless in the first place.
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Access token is required");
  }

  const payload = verifyAccessToken(header.slice("Bearer ".length));

  if (await isUserAccessRevoked(payload.sub)) {
    throw ApiError.unauthorized("Your session has been revoked. Please log in again.");
  }

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
