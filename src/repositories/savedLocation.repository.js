import { prisma } from "../config/database.js";

export function create(passengerId, data) {
  return prisma.savedLocation.create({ data: { ...data, passengerId } });
}

export function listByPassenger(passengerId) {
  return prisma.savedLocation.findMany({
    where: { passengerId },
    orderBy: { createdAt: "desc" },
  });
}

export function findById(id) {
  return prisma.savedLocation.findUnique({ where: { id } });
}

export function update(id, data) {
  return prisma.savedLocation.update({ where: { id }, data });
}

export function remove(id) {
  return prisma.savedLocation.delete({ where: { id } });
}
