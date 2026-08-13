import { z } from "zod";
import { registry, successResponse, standardErrors, bearerAuth } from "../registry.js";
import {
  createVehicleSchema,
  updateVehicleSchema,
  uploadDocumentSchema,
  documentParamsSchema,
  idParamSchema,
} from "../../validators/vehicle.validator.js";

const vehicleSchema = registry.register(
  "Vehicle",
  z.object({
    id: z.string(),
    driverId: z.string(),
    type: z.enum(["BIKE", "AUTO", "SEDAN", "SUV", "HATCHBACK"]),
    make: z.string(),
    model: z.string(),
    year: z.number(),
    color: z.string(),
    plateNumber: z.string(),
    capacity: z.number(),
    isVerified: z.boolean(),
    isActive: z.boolean(),
  })
);

const vehicleDocumentSchema = registry.register(
  "VehicleDocument",
  z.object({
    id: z.string(),
    vehicleId: z.string(),
    type: z.enum(["REGISTRATION", "INSURANCE", "PERMIT", "POLLUTION_CERTIFICATE"]),
    fileUrl: z.string(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    expiryDate: z.string().nullable(),
  })
);

function vehicleRoute(config) {
  registry.registerPath({ tags: ["Vehicles"], security: bearerAuth, ...config });
}

vehicleRoute({
  method: "get",
  path: "/api/v1/vehicles",
  summary: "List your own vehicles",
  responses: { 200: successResponse(z.array(vehicleSchema)), ...standardErrors(401) },
});

vehicleRoute({
  method: "post",
  path: "/api/v1/vehicles",
  summary: "Add a vehicle",
  description: "Driver accounts only. Starts unverified.",
  request: { body: { content: { "application/json": { schema: createVehicleSchema.shape.body } } } },
  responses: { 201: successResponse(vehicleSchema), ...standardErrors(400, 401, 403) },
});

vehicleRoute({
  method: "get",
  path: "/api/v1/vehicles/{id}",
  summary: "Get a vehicle you own",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(vehicleSchema), ...standardErrors(401, 403, 404) },
});

vehicleRoute({
  method: "patch",
  path: "/api/v1/vehicles/{id}",
  summary: "Update a vehicle you own",
  description:
    "Editing an identity field (make/model/year/plateNumber) on an already-verified vehicle resets isVerified to false.",
  request: {
    params: updateVehicleSchema.shape.params,
    body: { content: { "application/json": { schema: updateVehicleSchema.shape.body } } },
  },
  responses: { 200: successResponse(vehicleSchema), ...standardErrors(400, 401, 403, 404) },
});

vehicleRoute({
  method: "delete",
  path: "/api/v1/vehicles/{id}",
  summary: "Deactivate a vehicle you own",
  description: "Soft delete (isActive=false) — never hard-deleted, since a Ride may reference it.",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(z.null()), ...standardErrors(401, 403, 404) },
});

vehicleRoute({
  method: "get",
  path: "/api/v1/vehicles/{id}/documents",
  summary: "List documents for a vehicle you own",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(z.array(vehicleDocumentSchema)), ...standardErrors(401, 403, 404) },
});

vehicleRoute({
  method: "post",
  path: "/api/v1/vehicles/{id}/documents",
  summary: "Upload a vehicle document",
  description: "multipart/form-data — field `document` is the file (PDF/JPEG/PNG, 5MB max), field `type` is the document type.",
  request: {
    params: uploadDocumentSchema.shape.params,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            document: z.string().openapi({ type: "string", format: "binary" }),
            type: z.enum(["REGISTRATION", "INSURANCE", "PERMIT", "POLLUTION_CERTIFICATE"]),
            expiryDate: z.string().datetime().optional(),
          }),
        },
      },
    },
  },
  responses: { 201: successResponse(vehicleDocumentSchema), ...standardErrors(400, 401, 403, 404) },
});

vehicleRoute({
  method: "get",
  path: "/api/v1/vehicles/{id}/documents/{documentId}/file",
  summary: "Download a document you own",
  request: { params: documentParamsSchema.shape.params },
  responses: {
    200: { description: "The raw file (PDF/JPEG/PNG)" },
    ...standardErrors(401, 403, 404),
  },
});

vehicleRoute({
  method: "delete",
  path: "/api/v1/vehicles/{id}/documents/{documentId}",
  summary: "Remove a document you own",
  description: "Fails with 409 once the document has been APPROVED.",
  request: { params: documentParamsSchema.shape.params },
  responses: { 200: successResponse(z.null()), ...standardErrors(401, 403, 404, 409) },
});

export { vehicleSchema, vehicleDocumentSchema };
