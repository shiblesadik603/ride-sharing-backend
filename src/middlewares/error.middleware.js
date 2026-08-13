import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../config/logger.js";
import { isProduction } from "../config/env.js";

/**
 * Normalizes any thrown value (ApiError, ZodError, Prisma error, or an
 * unexpected bug) into a consistent { statusCode, message, details } shape.
 * Keeping this translation in one place means controllers/services never
 * need to know how to format an HTTP error response — they just throw.
 */
function normalizeError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.badRequest("Validation failed", err.flatten().fieldErrors);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return ApiError.conflict(`Duplicate value for field(s): ${err.meta?.target}`);
    }
    if (err.code === "P2025") {
      return ApiError.notFound("Record not found");
    }
    return ApiError.badRequest("Database request error");
  }

  return ApiError.internal(isProduction ? "Something went wrong" : err.message);
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const error = normalizeError(err);

  if (!error.isOperational || error.statusCode >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.originalUrl });
  }

  res.status(error.statusCode).json({
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    details: error.details,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
