import winston from "winston";
import { env, isProduction } from "./env.js";

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${ts} ${level}: ${stack || message}${metaStr}`;
  })
);

// Structured JSON in production so log aggregators (CloudWatch, Datadog,
// Loki, etc.) can index fields instead of parsing free-text lines.
const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});
