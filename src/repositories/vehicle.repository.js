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

/** Active + verified vehicles are the only ones eligible to go online or
 * be assigned to a ride — an unverified vehicle shouldn't be driveable. */
export function listActiveVerifiedByDriver(driverId) {
  return prisma.vehicle.findMany({ where: { driverId, isActive: true, isVerified: true } });
}

export function findActiveVerifiedByDriverAndType(driverId, type) {
  return prisma.vehicle.findFirst({
    where: { driverId, type, isActive: true, isVerified: true },
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
