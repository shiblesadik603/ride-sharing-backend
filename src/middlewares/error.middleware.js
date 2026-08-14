import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { MulterError } from "multer";
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

  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File must be 5MB or smaller" : err.message;
    return ApiError.badRequest(message);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return ApiError.conflict(`Duplicate value for field(s): ${err.meta?.target}`);
    }
    if (err.code === "P2025") {
      return ApiError.notFound("Record not found");
    }
    if (err.code === "P2010" && err.meta?.code === "23514") {
      // A DB-level CHECK constraint rejected the write — e.g. wallets'
      // `balance >= 0`. The app-level guard (tryDebit's atomic conditional
      // update) should always catch this first, so reaching the DB
      // constraint at all means either that guard was bypassed somewhere
      // or a bug slipped past it — worth a clear message rather than the
      // generic "database request error" below.
      return ApiError.badRequest("This action would violate a data integrity constraint");
    }
    if (err.code === "P2024") {
      // Prisma's connection pool is exhausted — every connection is
      // checked out and none freed up before the pool-acquisition timeout.
      // This is server capacity, not a malformed client request, so it
      // gets a 503 (retry-appropriate) instead of a 400/500.
      return new ApiError(503, "The server is temporarily overloaded. Please try again shortly.");
    }
    return ApiError.badRequest("Database request error");
  }

  return ApiError.internal(isProduction ? "Something went wrong" : err.message);
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const error = normalizeError(err);

  if (!error.isOperational || error.statusCode >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.originalUrl, requestId: req.id });
  }

  res.status(error.statusCode).json({
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    details: error.details,
    requestId: req.id,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
