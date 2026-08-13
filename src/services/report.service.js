import * as reportRepository from "../repositories/report.repository.js";
import * as notificationService from "./notification.service.js";

export async function generateSummary({ from, to }) {
  const [ridesCompleted, ridesCancelled, revenue, newUsers, newDrivers, currentlyOnlineDrivers] =
    await Promise.all([
      reportRepository.countCompletedRides(from, to),
      reportRepository.countCancelledRides(from, to),
      reportRepository.sumRevenue(from, to),
      reportRepository.countNewUsers(from, to),
      reportRepository.countNewDrivers(from, to),
      reportRepository.countOnlineDrivers(),
    ]);

  return {
    period: { from, to },
    ridesCompleted,
    ridesCancelled,
    revenue,
    newUsers,
    newDrivers,
    currentlyOnlineDrivers,
  };
}

function renderSummaryHtml(summary) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  return `<h2>Ride Sharing — Ops Summary</h2>
    <p>${fmt(summary.period.from)} to ${fmt(summary.period.to)}</p>
    <ul>
      <li>Rides completed: ${summary.ridesCompleted}</li>
      <li>Rides cancelled: ${summary.ridesCancelled}</li>
      <li>Revenue collected: $${summary.revenue.toFixed(2)}</li>
      <li>New users: ${summary.newUsers}</li>
      <li>New drivers: ${summary.newDrivers}</li>
      <li>Currently online drivers: ${summary.currentlyOnlineDrivers}</li>
    </ul>`;
}

/**
 * Generates the summary and emails it to every active admin — each send
 * goes through notificationService.notify, so it's queued, retried on
 * transient failure, and recorded in the Notification table exactly like
 * any other email, rather than a one-off send path with its own rules.
 */
export async function generateAndEmailSummary({ from, to }) {
  const summary = await generateSummary({ from, to });
  const admins = await reportRepository.listActiveAdmins();
  const html = renderSummaryHtml(summary);

  await Promise.all(
    admins.map((admin) =>
      notificationService.notify({
        userId: admin.id,
        email: admin.email,
        channel: "EMAIL",
        title: "Daily Ops Summary",
        html,
      })
    )
  );

  return summary;
}
