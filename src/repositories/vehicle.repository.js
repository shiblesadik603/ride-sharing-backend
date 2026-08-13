import { prisma } from "../config/database.js";

export function create(driverId, data) {
  return prisma.vehicle.create({ data: { ...data, driverId } });
}

export function findById(id) {
  return prisma.vehicle.findUnique({ where: { id }, include: { documents: true } });
}

export function listByDriver(driverId) {
  return prisma.vehicle.findMany({
    where: { driverId },
    include: { documents: true },
    orderBy: { createdAt: "desc" },
  });
}

export function update(id, data) {
  return prisma.vehicle.update({ where: { id }, data });
}

export function deactivate(id) {
  return prisma.vehicle.update({ where: { id }, data: { isActive: false } });
}

export function setVerified(id, isVerified) {
  return prisma.vehicle.update({ where: { id }, data: { isVerified } });
}
