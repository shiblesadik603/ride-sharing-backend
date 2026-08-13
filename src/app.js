import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { notFoundHandler } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { generateOpenApiDocument } from "./docs/index.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import vehicleRoutes from "./routes/vehicle.routes.js";
import driverRoutes from "./routes/driver.routes.js";
import rideRoutes from "./routes/ride.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

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

// Stripe signs the raw request body — this has to be mounted before the
// global express.json() below, or by the time a webhook request reaches
// it the body would already be parsed into an object, and signature
// verification would fail against bytes that no longer exist.
app.use("/api/v1/webhooks", webhookRoutes);

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
app.use("/api/v1/drivers", driverRoutes);
app.use("/api/v1/rides", rideRoutes);
app.use("/api/v1/wallet", walletRoutes);

// Generated once at startup, not per-request — the document only changes
// when a validator or route file changes, i.e. when the process restarts.
const openApiDocument = generateOpenApiDocument();
app.get("/api-docs.json", (req, res) => res.json(openApiDocument));
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, { customSiteTitle: "Ride Sharing Backend API" })
);

app.use(notFoundHandler);
app.use(errorHandler);
