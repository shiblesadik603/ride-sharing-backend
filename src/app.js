import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { notFoundHandler } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import vehicleRoutes from "./routes/vehicle.routes.js";

export const app = express();

// Behind a reverse proxy (nginx, Railway, Render, ALB) in every real
// deployment — without this, express-rate-limit and req.ip both read the
// proxy's IP instead of the client's.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(","),
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

app.use(
  morgan(env.NODE_ENV === "development" ? "dev" : "combined", {
    stream: { write: (message) => logger.http(message.trim()) },
  })
);

// Baseline limiter for all routes. Auth endpoints (login, register,
// password reset) layer stricter, endpoint-specific limits on top of this
// in auth.routes.js — this is just the floor that protects every route
// from casual abuse.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use("/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/vehicles", vehicleRoutes);

// Further feature routers (rides, ...) will be mounted here, under
// /api/v1, as each phase is built.

app.use(notFoundHandler);
app.use(errorHandler);
