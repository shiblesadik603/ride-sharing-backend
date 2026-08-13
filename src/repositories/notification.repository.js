import { prisma } from "../config/database.js";

export function create(data) {
  return prisma.notification.create({ data });
}

export function findById(id) {
  return prisma.notification.findUnique({ where: { id } });
}

export function markSent(id) {
  return prisma.notification.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
}

export function markFailed(id) {
  return prisma.notification.update({ where: { id }, data: { status: "FAILED" } });
}

export function markRead(id) {
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

export function listByUser(userId, { page, limit, isRead }) {
  return prisma.notification.findMany({
    where: { userId, ...(isRead !== undefined && { isRead }) },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countByUser(userId, { isRead }) {
  return prisma.notification.count({ where: { userId, ...(isRead !== undefined && { isRead }) } });
}
