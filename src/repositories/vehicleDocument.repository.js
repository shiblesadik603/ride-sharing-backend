import { prisma } from "../config/database.js";

export function create({ vehicleId, type, fileUrl, expiryDate }) {
  return prisma.vehicleDocument.create({ data: { vehicleId, type, fileUrl, expiryDate } });
}

export function findById(id) {
  return prisma.vehicleDocument.findUnique({ where: { id }, include: { vehicle: true } });
}

export function remove(id) {
  return prisma.vehicleDocument.delete({ where: { id } });
}

export function review(id, status) {
  return prisma.vehicleDocument.update({
    where: { id },
    data: { status, reviewedAt: new Date() },
  });
}
