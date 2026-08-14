import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redis, redisSubscriber } from "../config/redis.js";
import { verifyAccessToken } from "../services/token.service.js";
import * as driverService from "../services/driver.service.js";
import * as rideService from "../services/ride.service.js";
import { registerSocketMetrics } from "../config/metrics.js";
import { setIo } from "./socket.emitter.js";

const locationPayloadSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// A driver app pinging every few seconds is normal; one emitting as fast
// as the transport allows (buggy client, or deliberate spam) turns into
// unbounded Redis GEOADD + DB writes + broadcast fan-out per socket. This
// is a minimum spacing, not a token bucket — simple, in-memory, and reset
// on every reconnect, which is the right lifetime for it (nothing here
// needs to survive across connections).
const MIN_LOCATION_INTERVAL_MS = 2000;

/**
 * Every socket authenticates the same way every REST request does — a
 * short-lived JWT access token, just carried in the handshake instead of
 * an Authorization header. There's no separate socket session concept;
 * a socket is only ever as trusted as the access token it connected with,
 * and it disconnects the moment that token can no longer be verified
 * (expiry included — a long-lived tab has to refresh its access token
 * and reconnect the socket with it, same as it re-auths REST calls).
 */
function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error("Authentication token is required");
    const payload = verifyAccessToken(token);
    socket.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new Error("Authentication failed"));
  }
}

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(","),
      credentials: true,
    },
  });

  // Redis pub/sub adapter: without this, an event emitted on the server
  // instance handling driver A's connection would never reach passenger
  // B's socket if B happens to be connected to a different instance —
  // the moment there's more than one Node process, in-memory broadcast
  // silently stops working. `redisSubscriber` was set aside for exactly
  // this in Phase 1 and has been unused until now.
  io.adapter(createAdapter(redis, redisSubscriber));
  registerSocketMetrics(io);

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    // Every socket's personal channel — this is the only room concept in
    // the app. Server-initiated pushes always target a userId, never a
    // ride, so "am I allowed to see this event" is answered by "is it
    // addressed to me" rather than needing a separate join/leave-a-room
    // authorization check.
    socket.join(`user:${socket.user.id}`);
    logger.debug("Socket connected", { userId: socket.user.id });

    // Best-effort: a resync failure shouldn't prevent the connection
    // itself from working, just leave the client relying on push events
    // going forward (its pre-existing behavior).
    rideService
      .getMyActiveRide(socket.user.id)
      .then((activeRide) => {
        if (activeRide) socket.emit("ride:sync", activeRide);
      })
      .catch((err) => {
        logger.warn("Failed to sync active ride on connect", {
          userId: socket.user.id,
          error: err.message,
        });
      });

    let lastLocationAt = 0;
    socket.on("driver:location", async (raw) => {
      try {
        const now = Date.now();
        if (now - lastLocationAt < MIN_LOCATION_INTERVAL_MS) return;
        lastLocationAt = now;

        const data = locationPayloadSchema.parse(raw);
        await driverService.updateLocation(socket.user.id, data);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      logger.debug("Socket disconnected", { userId: socket.user.id });
    });
  });

  setIo(io);
  return io;
}
