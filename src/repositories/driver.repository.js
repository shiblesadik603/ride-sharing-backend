import { prisma } from "../config/database.js";

export function findById(id) {
  return prisma.driver.findUnique({ where: { id } });
}

export function findByUserId(userId) {
  return prisma.driver.findUnique({ where: { userId } });
}
