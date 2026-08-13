import { prisma } from "../config/database.js";

export function record({ actorId, action, entityType, entityId, metadata, ipAddress }) {
  return prisma.auditLog.create({
    data: { actorId, action, entityType, entityId, metadata, ipAddress },
  });
}
