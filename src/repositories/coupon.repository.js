import { prisma } from "../config/database.js";

export function findByCode(code) {
  return prisma.coupon.findUnique({ where: { code } });
}

export function findById(id) {
  return prisma.coupon.findUnique({ where: { id } });
}

export function create(data) {
  return prisma.coupon.create({ data });
}

export function update(id, data) {
  return prisma.coupon.update({ where: { id }, data });
}

export function list({ page, limit, isActive }) {
  return prisma.coupon.findMany({
    where: isActive !== undefined ? { isActive } : undefined,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function count({ isActive }) {
  return prisma.coupon.count({ where: isActive !== undefined ? { isActive } : undefined });
}
