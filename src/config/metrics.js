import client from "prom-client";
import { prisma } from "./database.js";
import { redis } from "./redis.js";
import { emailQueue, maintenanceQueue, reportQueue } from "../jobs/queues.js";
import { logger } from "./logger.js";

/**
 * A dedicated registry, not the global default one — this process runs
 * both the HTTP server and (optionally, per ENABLE_JOBS) in-process job
 * workers, and an explicit registry makes it obvious every metric
 * collected here is intentional rather than whatever any dependency
 * happens to have registered globally.
 */
export const registry = new client.Registry();

// Process-level metrics (CPU, resident memory, heap, event-loop lag, open
// file descriptors, GC pauses) — this single call is most of "CPU" and
// "Memory" from the monitoring requirements, for free, without hand-rolling
// any of it.
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const rideOutcomesTotal = new client.Counter({
  name: "ride_outcomes_total",
  help: "Rides reaching a terminal state, by outcome",
  labelNames: ["outcome"], // completed | cancelled | expired
  registers: [registry],
});

export const paymentOutcomesTotal = new client.Counter({
  name: "payment_outcomes_total",
  help: "Payment attempts, by method and outcome",
  labelNames: ["method", "outcome"], // outcome: completed | failed
  registers: [registry],
});

// Sampled on scrape rather than kept incrementally in sync via inc()/dec()
// calls scattered across goOnline/goOffline/the heartbeat sweep — a direct
// count is always correct by construction, where incremental bookkeeping
// would silently drift if any single code path ever forgot to update it.
new client.Gauge({
  name: "drivers_online",
  help: "Drivers currently online (isOnline=true in Postgres)",
  registers: [registry],
  async collect() {
    this.set(await prisma.driver.count({ where: { isOnline: true } }));
  },
});

// Sampled on scrape, not maintained incrementally — these all reflect
// "current state of an external system," which is naturally a pull, not
// something to keep incrementally in sync with via app-code bookkeeping.
new client.Gauge({
  name: "database_up",
  help: "1 if the database responds to a query, 0 otherwise",
  registers: [registry],
  async collect() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      this.set(1);
    } catch {
      this.set(0);
    }
  },
});

new client.Gauge({
  name: "redis_up",
  help: "1 if Redis responds to PING, 0 otherwise",
  registers: [registry],
  async collect() {
    try {
      await redis.ping();
      this.set(1);
    } catch {
      this.set(0);
    }
  },
});

async function sampleQueue(gauge, queue, name) {
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
    for (const [state, count] of Object.entries(counts)) {
      gauge.set({ queue: name, state }, count);
    }
  } catch (err) {
    logger.warn("Failed to sample queue depth for metrics", { queue: name, error: err.message });
  }
}

// prom-client has no registry-level "add an arbitrary async collector"
// hook — the per-metric `collect()` option (used above for database_up /
// redis_up / drivers_online) is the actual extension point, so this Gauge
// samples all three queues itself from inside its own collect().
new client.Gauge({
  name: "queue_jobs",
  help: "BullMQ job counts by queue and state",
  labelNames: ["queue", "state"],
  registers: [registry],
  async collect() {
    await Promise.all([
      sampleQueue(this, emailQueue, "email"),
      sampleQueue(this, maintenanceQueue, "maintenance"),
      sampleQueue(this, reportQueue, "report"),
    ]);
  },
});

/**
 * Sockets don't have a natural "sample on scrape" source the way the
 * queues/DB/Redis gauges above do — `io.engine.clientsCount` only exists
 * once Socket.IO has actually initialized, which happens after this
 * module is first imported. Called once from sockets/index.js right after
 * `initSockets` creates `io`, rather than importing `io` here and risking
 * a circular import between the two modules.
 */
export function registerSocketMetrics(io) {
  new client.Gauge({
    name: "socket_connections",
    help: "Currently connected Socket.IO clients",
    registers: [registry],
    collect() {
      this.set(io.engine.clientsCount);
    },
  });
}
