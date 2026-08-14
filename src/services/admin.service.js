import { ApiError } from "../utils/ApiError.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
import * as userRepository from "../repositories/user.repository.js";
import * as tokenRepository from "../repositories/token.repository.js";
import * as auditLogRepository from "../repositories/auditLog.repository.js";
import { revokeAllUserAccessTokens } from "./token.service.js";

export async function listUsers({ page, limit, role, isActive, search }) {
  const [users, total] = await Promise.all([
    userRepository.listUsers({ page, limit, role, isActive, search }),
    userRepository.countUsers({ role, isActive, search }),
  ]);

  return {
    users: users.map(sanitizeUser),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getUserById(id) {
  const user = await userRepository.findByIdWithProfile(id);
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  return sanitizeUser(user);
}

/**
 * Deactivating an account is exactly the kind of sensitive, disputable
 * action AuditLog exists for — "who did this, to whom, and when" needs to
 * survive independently of the User row it affected.
 */
export async function setUserActiveStatus(targetUserId, isActive, actor) {
  const target = await userRepository.findById(targetUserId);
  if (!target) {
    throw ApiError.notFound("User not found");
  }
  if (target.role === "ADMIN") {
    throw ApiError.forbidden("Admin accounts cannot be deactivated through this endpoint");
  }

  const updated = await userRepository.setActiveStatus(targetUserId, isActive);

  if (!isActive) {
    // A deactivated account shouldn't be able to keep using tokens issued
    // before the ban — revoke every session immediately, refresh and
    // access tokens both (revoking only refresh tokens still leaves an
    // already-issued access token usable for up to its own TTL).
    await tokenRepository.revokeAllUserRefreshTokens(targetUserId);
    await revokeAllUserAccessTokens(targetUserId);
  }

  await auditLogRepository.record({
    actorId: actor.id,
    action: isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: targetUserId,
    ipAddress: actor.ipAddress,
  });

  return sanitizeUser(updated);
}
