import { prisma } from "../config/database.js";

function toCountMap(rows, key) {
  return Object.fromEntries(rows.map((r) => [r[key], r._count]));
}

export async function countUsersByRole() {
  const rows = await prisma.user.groupBy({ by: ["role"], _count: true });
  return toCountMap(rows, "role");
}

export async function countDriversByVerificationStatus() {
  const rows = await prisma.driver.groupBy({ by: ["verificationStatus"], _count: true });
  return toCountMap(rows, "verificationStatus");
}

export async function countVehicles() {
  const [total, verified] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { isVerified: true } }),
  ]);
  return { total, verified, pendingVerification: total - verified };
}

export function countActiveRides() {
  return prisma.ride.count({
    where: { status: { in: ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"] } },
  });
}

export async function countRidesByStatus() {
  const rows = await prisma.ride.groupBy({ by: ["status"], _count: true });
  return toCountMap(rows, "status");
}

export function countOnlineDrivers() {
  return prisma.driver.count({ where: { isOnline: true } });
}

export async function countPaymentsByStatus() {
  const rows = await prisma.payment.groupBy({ by: ["status"], _count: true });
  return toCountMap(rows, "status");
}

export async function sumRevenueSince(since) {
  const result = await prisma.payment.aggregate({
    where: { status: "COMPLETED", ...(since && { paidAt: { gte: since } }) },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

/**
 * Raw SQL, not Prisma's query builder — grouping by a truncated timestamp
 * (day/week/month buckets) isn't something groupBy expresses, and this is
 * exactly the kind of read-model query report.repository.js already
 * established the precedent for going straight to Prisma for. `interval`
 * is restricted to a fixed enum by the validator before it ever reaches
 * here, and is still passed as a bound parameter (not string-interpolated)
 * for defense in depth — Postgres accepts DATE_TRUNC's unit as a
 * parameterized text argument.
 *
 * COUNT/SUM cast to ::int/::float explicitly: Postgres returns COUNT as
 * bigint and NUMERIC sums as strings by default over the raw wire
 * protocol, neither of which JSON.stringify handles by default — the
 * casts make sure what comes back is a plain JS number.
 */
export function rideTrends({ from, to, interval }) {
  return prisma.$queryRaw`
    SELECT
      DATE_TRUNC(${interval}, "requestedAt") AS period,
      COUNT(*)::int AS requested,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
      COALESCE(AVG("actualFare") FILTER (WHERE status = 'COMPLETED'), 0)::float AS "avgFare"
    FROM rides
    WHERE "requestedAt" >= ${from} AND "requestedAt" < ${to}
    GROUP BY period
    ORDER BY period ASC
  `;
}

export function revenueTrends({ from, to, interval }) {
  return prisma.$queryRaw`
    SELECT
      DATE_TRUNC(${interval}, "paidAt") AS period,
      COALESCE(SUM(amount), 0)::float AS revenue,
      COUNT(*)::int AS "paymentCount"
    FROM payments
    WHERE status = 'COMPLETED' AND "paidAt" >= ${from} AND "paidAt" < ${to}
    GROUP BY period
    ORDER BY period ASC
  `;
}

const SORT_FIELD = { earnings: "totalEarnings", rides: "totalRides", rating: "averageRating" };

export function topDrivers(by, limit) {
  return prisma.driver.findMany({
    where: by === "rating" ? { totalRides: { gt: 0 } } : undefined, // unrated drivers default to 0, not meaningful
    orderBy: { [SORT_FIELD[by]]: "desc" },
    take: limit,
    select: {
      id: true,
      totalRides: true,
      totalEarnings: true,
      averageRating: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
}
