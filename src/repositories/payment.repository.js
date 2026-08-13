import { prisma } from "../config/database.js";

export function create(data, client = prisma) {
  return client.payment.create({ data });
}

export function findById(id) {
  return prisma.payment.findUnique({ where: { id }, include: { refunds: true, ride: true } });
}

export function findByRideId(rideId) {
  return prisma.payment.findUnique({ where: { rideId }, include: { refunds: true } });
}

export function findByStripePaymentIntentId(stripePaymentIntentId) {
  return prisma.payment.findUnique({ where: { stripePaymentIntentId } });
}

export function updateStatus(id, status, extra = {}) {
  return prisma.payment.update({ where: { id }, data: { status, ...extra } });
}

export function list({ page, limit, status }) {
  return prisma.payment.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function count({ status }) {
  return prisma.payment.count({ where: status ? { status } : undefined });
}
