import { prisma } from "../config/database.js";

export function findByUserId(userId) {
  return prisma.passenger.findUnique({ where: { userId } });
}
