import { prisma } from "../config/database.js";

export function record(rideId, status, metadata) {
  return prisma.rideStatusLog.create({ data: { rideId, status, metadata } });
}
