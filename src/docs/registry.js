import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Must run before any schema in the app is built with `.openapi()` calls —
// this patches Zod's prototype so every schema (including ones already
// defined in the validators/ directory, imported by the docs/paths files
// below) gains the method zod-to-openapi needs to attach metadata.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Access token from /auth/login, /auth/register, or /auth/refresh.",
});

const errorSchema = registry.register(
  "Error",
  z.object({
    success: z.boolean().openapi({ example: false }),
    statusCode: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Validation failed" }),
    details: z.record(z.string(), z.unknown()).optional(),
  })
);

/** Every endpoint reuses this — it's the literal shape error.middleware.js
 * produces, not a docs-only guess at what errors might look like. */
export function errorResponse(description) {
  return { description, content: { "application/json": { schema: errorSchema } } };
}

const COMMON_ERRORS = {
  400: errorResponse("Validation failed"),
  401: errorResponse("Missing, invalid, or expired access token"),
  403: errorResponse("Authenticated, but not permitted to perform this action"),
  404: errorResponse("Resource not found (or not yours)"),
  409: errorResponse("Conflicts with the resource's current state"),
};

/** Picks a subset of the standard error responses relevant to a given
 * endpoint, so a GET that can't conflict doesn't advertise a 409. */
export function standardErrors(...codes) {
  return Object.fromEntries(codes.map((code) => [code, COMMON_ERRORS[code]]));
}

/** The literal shape ApiResponse produces — `data`'s inner shape is
 * supplied per endpoint, everything wrapping it is identical everywhere. */
export function successResponse(dataSchema, description = "Success") {
  return {
    description,
    content: {
      "application/json": {
        schema: z.object({
          success: z.boolean().openapi({ example: true }),
          statusCode: z.number(),
          message: z.string(),
          data: dataSchema,
        }),
      },
    },
  };
}

export function jsonBody(schema, description = "Request body") {
  return { body: { description, content: { "application/json": { schema } } } };
}

export const bearerAuth = [{ bearerAuth: [] }];
