import { ApiError } from "../utils/ApiError.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as vehicleRepository from "../repositories/vehicle.repository.js";
import * as vehicleDocumentRepository from "../repositories/vehicleDocument.repository.js";
import * as auditLogRepository from "../repositories/auditLog.repository.js";

export async function listDrivers({ page, limit, verificationStatus }) {
  const [drivers, total] = await Promise.all([
    driverRepository.list({ page, limit, verificationStatus }),
    driverRepository.count({ verificationStatus }),
  ]);
  return { drivers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getDriverById(id) {
  const driver = await driverRepository.findByIdWithDetails(id);
  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }
  return driver;
}

export async function reviewDriver(driverId, verificationStatus, reason, actor) {
  const driver = await driverRepository.findById(driverId);
  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }

  const updated = await driverRepository.setVerificationStatus(driverId, verificationStatus);

  await auditLogRepository.record({
    actorId: actor.id,
    action: `DRIVER_${verificationStatus}`,
    entityType: "Driver",
    entityId: driverId,
    metadata: reason ? { reason } : undefined,
    ipAddress: actor.ipAddress,
  });

  return updated;
}

export async function reviewVehicle(vehicleId, isVerified, actor) {
  const vehicle = await vehicleRepository.findById(vehicleId);
  if (!vehicle) {
    throw ApiError.notFound("Vehicle not found");
  }

  const updated = await vehicleRepository.setVerified(vehicleId, isVerified);

  await auditLogRepository.record({
    actorId: actor.id,
    action: isVerified ? "VEHICLE_VERIFIED" : "VEHICLE_UNVERIFIED",
    entityType: "Vehicle",
    entityId: vehicleId,
    ipAddress: actor.ipAddress,
  });

  return updated;
}

export async function reviewDocument(documentId, status, actor) {
  const document = await vehicleDocumentRepository.findById(documentId);
  if (!document) {
    throw ApiError.notFound("Document not found");
  }

  const updated = await vehicleDocumentRepository.review(documentId, status);

  await auditLogRepository.record({
    actorId: actor.id,
    action: `DOCUMENT_${status}`,
    entityType: "VehicleDocument",
    entityId: documentId,
    ipAddress: actor.ipAddress,
  });

  return updated;
}
