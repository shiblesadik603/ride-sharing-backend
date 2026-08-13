import * as analyticsRepository from "../repositories/analytics.repository.js";
import * as reportRepository from "../repositories/report.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboard() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    usersByRole,
    driversByStatus,
    vehicles,
    activeRides,
    ridesByStatus,
    onlineDrivers,
    paymentsByStatus,
    revenueAllTime,
    revenue7d,
    revenue30d,
    newUsers7d,
  ] = await Promise.all([
    analyticsRepository.countUsersByRole(),
    analyticsRepository.countDriversByVerificationStatus(),
    analyticsRepository.countVehicles(),
    analyticsRepository.countActiveRides(),
    analyticsRepository.countRidesByStatus(),
    analyticsRepository.countOnlineDrivers(),
    analyticsRepository.countPaymentsByStatus(),
    analyticsRepository.sumRevenueSince(null),
    analyticsRepository.sumRevenueSince(sevenDaysAgo),
    analyticsRepository.sumRevenueSince(thirtyDaysAgo),
    reportRepository.countNewUsers(sevenDaysAgo, now),
  ]);

  return {
    generatedAt: now,
    users: {
      total: Object.values(usersByRole).reduce((sum, n) => sum + n, 0),
      byRole: usersByRole,
      newLast7Days: newUsers7d,
    },
    drivers: { byVerificationStatus: driversByStatus, onlineNow: onlineDrivers },
    vehicles,
    rides: { active: activeRides, byStatus: ridesByStatus },
    revenue: { allTime: revenueAllTime, last7Days: revenue7d, last30Days: revenue30d },
    payments: { byStatus: paymentsByStatus },
  };
}

export function getRideTrends({ from, to, interval }) {
  return analyticsRepository.rideTrends({ from, to, interval });
}

export function getRevenueTrends({ from, to, interval }) {
  return analyticsRepository.revenueTrends({ from, to, interval });
}

export function getTopDrivers({ by, limit }) {
  return analyticsRepository.topDrivers(by, limit);
}
