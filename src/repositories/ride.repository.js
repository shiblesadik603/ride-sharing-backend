import { prisma } from "../config/database.js";

export const ACTIVE_STATUSES = ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"];

const DETAIL_INCLUDE = {
  passenger: { include: { user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } } } },
  driver: { include: { user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } } } },
  vehicle: true,
  payment: true,
};

export function create(data) {
  return prisma.ride.create({ data, include: DETAIL_INCLUDE });
}

export function findById(id) {
  return prisma.ride.findUnique({ where: { id }, include: DETAIL_INCLUDE });
}

export function findManyByIds(ids) {
  return prisma.ride.findMany({ where: { id: { in: ids } }, include: DETAIL_INCLUDE });
}

export function findActiveByPassenger(passengerId) {
  return prisma.ride.findFirst({
    where: { passengerId, status: { in: ACTIVE_STATUSES } },
  });
}

export function findActiveByDriver(driverId) {
  return prisma.ride.findFirst({
    where: { driverId, status: { in: ACTIVE_STATUSES } },
  });
}

/** Minimal-select variant for the location-ping hot path (fires on every
 * GPS update while a ride is active) — avoids the full DETAIL_INCLUDE
 * join for a call site that only needs one field off it. */
export function findActiveByDriverWithPassengerId(driverId) {
  return prisma.ride.findFirst({
    where: { driverId, status: { in: ACTIVE_STATUSES } },
    select: { id: true, status: true, passenger: { select: { userId: true } } },
  });
}

/**
 * The concurrency guard for driver matching: multiple drivers can call
 * accept on the same REQUESTED ride at once, but only the update whose
 * WHERE clause still matches `status: REQUESTED, driverId: null` at the
 * instant it executes actually writes a row — Postgres serializes
 * concurrent UPDATEs to the same row, so exactly one caller sees count 1
 * and every other caller sees count 0, with no separate locking needed.
 */
export function tryAssignDriver(rideId, driverId, vehicleId) {
  return prisma.ride.updateMany({
    where: { id: rideId, status: "REQUESTED", driverId: null },
    data: { status: "ACCEPTED", driverId, vehicleId, acceptedAt: new Date() },
  });
}

export function updateStatus(rideId, data) {
  return prisma.ride.update({ where: { id: rideId }, data, include: DETAIL_INCLUDE });
}

export function listByPassenger({ passengerId, page, limit, status }) {
  return prisma.ride.findMany({
    where: { passengerId, ...(status && { status }) },
    include: DETAIL_INCLUDE,
    orderBy: { requestedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countByPassenger({ passengerId, status }) {
  return prisma.ride.count({ where: { passengerId, ...(status && { status }) } });
}

export function listByDriver({ driverId, page, limit, status }) {
  return prisma.ride.findMany({
    where: { driverId, ...(status && { status }) },
    include: DETAIL_INCLUDE,
    orderBy: { requestedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countByDriver({ driverId, status }) {
  return prisma.ride.count({ where: { driverId, ...(status && { status }) } });
}
