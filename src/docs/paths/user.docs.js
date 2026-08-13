import { z } from "zod";
import { registry, jsonBody, successResponse, standardErrors, bearerAuth } from "../registry.js";
import { userSchema } from "./auth.docs.js";
import {
  updateProfileSchema,
  changePasswordSchema,
  becomeDriverSchema,
  createSavedLocationSchema,
  updateSavedLocationSchema,
  idParamSchema,
  addFavoriteDriverSchema,
  removeFavoriteDriverSchema,
} from "../../validators/user.validator.js";
import { myRatingsQuerySchema } from "../../validators/rating.validator.js";
import { listNotificationsQuerySchema } from "../../validators/notification.validator.js";

const savedLocationSchema = registry.register(
  "SavedLocation",
  z.object({
    id: z.string(),
    label: z.string(),
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
    isFavorite: z.boolean(),
  })
);

const favoriteDriverSchema = registry.register(
  "FavoriteDriver",
  z.object({
    id: z.string(),
    driverId: z.string(),
    driver: z.object({
      id: z.string(),
      averageRating: z.string(),
      user: z.object({ firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable() }),
    }),
  })
);

function meRoute(config) {
  registry.registerPath({ tags: ["Users"], security: bearerAuth, ...config });
}

meRoute({
  method: "get",
  path: "/api/v1/users/me",
  summary: "Get your own profile, including passenger/driver/wallet summary",
  responses: { 200: successResponse(userSchema), ...standardErrors(401) },
});

meRoute({
  method: "patch",
  path: "/api/v1/users/me",
  summary: "Update your own profile",
  request: jsonBody(updateProfileSchema.shape.body),
  responses: { 200: successResponse(userSchema), ...standardErrors(400, 401) },
});

meRoute({
  method: "post",
  path: "/api/v1/users/me/change-password",
  summary: "Change your password",
  description: "Requires the current password. Revokes every other session on success.",
  request: jsonBody(changePasswordSchema.shape.body),
  responses: { 200: successResponse(z.null()), ...standardErrors(400, 401) },
});

meRoute({
  method: "post",
  path: "/api/v1/users/me/become-driver",
  summary: "Upgrade a passenger account to also be a driver",
  description: "One-way upgrade — keeps the passenger profile. Starts at verificationStatus PENDING.",
  request: jsonBody(becomeDriverSchema.shape.body),
  responses: { 200: successResponse(userSchema), ...standardErrors(400, 401, 409) },
});

meRoute({
  method: "get",
  path: "/api/v1/users/me/saved-locations",
  summary: "List your saved locations",
  responses: { 200: successResponse(z.array(savedLocationSchema)), ...standardErrors(401) },
});

meRoute({
  method: "post",
  path: "/api/v1/users/me/saved-locations",
  summary: "Create a saved location",
  description: "Passenger accounts only.",
  request: jsonBody(createSavedLocationSchema.shape.body),
  responses: { 201: successResponse(savedLocationSchema), ...standardErrors(400, 401, 403) },
});

meRoute({
  method: "patch",
  path: "/api/v1/users/me/saved-locations/{id}",
  summary: "Update a saved location you own",
  request: { params: updateSavedLocationSchema.shape.params, body: jsonBody(updateSavedLocationSchema.shape.body).body },
  responses: { 200: successResponse(savedLocationSchema), ...standardErrors(400, 401, 403, 404) },
});

meRoute({
  method: "delete",
  path: "/api/v1/users/me/saved-locations/{id}",
  summary: "Delete a saved location you own",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(z.null()), ...standardErrors(401, 403, 404) },
});

meRoute({
  method: "get",
  path: "/api/v1/users/me/favorite-drivers",
  summary: "List your favorite drivers",
  responses: { 200: successResponse(z.array(favoriteDriverSchema)), ...standardErrors(401) },
});

meRoute({
  method: "post",
  path: "/api/v1/users/me/favorite-drivers",
  summary: "Add a driver to your favorites",
  request: jsonBody(addFavoriteDriverSchema.shape.body),
  responses: { 201: successResponse(favoriteDriverSchema), ...standardErrors(400, 401, 403, 404, 409) },
});

meRoute({
  method: "delete",
  path: "/api/v1/users/me/favorite-drivers/{driverId}",
  summary: "Remove a driver from your favorites",
  request: { params: removeFavoriteDriverSchema.shape.params },
  responses: { 200: successResponse(z.null()), ...standardErrors(401, 403, 404) },
});

meRoute({
  method: "get",
  path: "/api/v1/users/me/ratings",
  summary: "List ratings you've received",
  request: { query: myRatingsQuerySchema.shape.query },
  responses: { 200: successResponse(z.object({ ratings: z.array(z.unknown()), pagination: z.unknown() })), ...standardErrors(401) },
});

meRoute({
  method: "get",
  path: "/api/v1/users/me/notifications",
  summary: "List your notifications",
  request: { query: listNotificationsQuerySchema.shape.query },
  responses: { 200: successResponse(z.object({ notifications: z.array(z.unknown()), pagination: z.unknown() })), ...standardErrors(401) },
});

meRoute({
  method: "patch",
  path: "/api/v1/users/me/notifications/{id}/read",
  summary: "Mark a notification as read",
  request: { params: idParamSchema.shape.params },
  responses: { 200: successResponse(z.unknown()), ...standardErrors(401, 404) },
});
