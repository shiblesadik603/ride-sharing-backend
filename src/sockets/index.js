import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redis, redisSubscriber } from "../config/redis.js";
import { verifyAccessToken } from "../services/token.service.js";
import * as driverService from "../services/driver.service.js";
import { setIo } from "./socket.emitter.js";

const locationPayloadSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

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

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    // Every socket's personal channel — this is the only room concept in
    // the app. Server-initiated pushes always target a userId, never a
    // ride, so "am I allowed to see this event" is answered by "is it
    // addressed to me" rather than needing a separate join/leave-a-room
    // authorization check.
    socket.join(`user:${socket.user.id}`);
    logger.debug("Socket connected", { userId: socket.user.id });

    socket.on("driver:location", async (raw) => {
      try {
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
