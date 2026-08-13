import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry.js";

// Side-effecting imports: each file calls registry.registerPath(...) for
// its domain's routes. Order matters only where one file imports a schema
// registered by another (auth.docs.js's userSchema, vehicle.docs.js's
// vehicleSchema, etc.) — those are plain JS imports, so the module graph
// already enforces correct ordering regardless of the order listed here.
import "./paths/health.docs.js";
import "./paths/auth.docs.js";
import "./paths/user.docs.js";
import "./paths/vehicle.docs.js";
import "./paths/driver.docs.js";
import "./paths/ride.docs.js";
import "./paths/wallet.docs.js";
import "./paths/admin.docs.js";

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Ride Sharing Backend API",
      version: "1.0.0",
      description:
        "Uber-like ride sharing backend, built incrementally, phase by phase. " +
        "Every request schema below is generated directly from the same Zod validators " +
        "the running server validates against — this document can't drift from what the API actually accepts.",
    },
    servers: [{ url: "/", description: "Current host" }],
  });
}
