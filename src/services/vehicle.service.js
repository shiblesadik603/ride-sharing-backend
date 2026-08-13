import { ApiError } from "../utils/ApiError.js";
import { deleteFile } from "../config/storage.js";
import * as driverRepository from "../repositories/driver.repository.js";
import * as vehicleRepository from "../repositories/vehicle.repository.js";
import * as vehicleDocumentRepository from "../repositories/vehicleDocument.repository.js";

const IDENTITY_FIELDS = ["make", "model", "year", "plateNumber"];

async function getOwnDriverId(userId) {
  const driver = await driverRepository.findByUserId(userId);
  if (!driver) {
    throw ApiError.forbidden("Only driver accounts can manage vehicles");
  }
  return driver.id;
}

async function getOwnVehicle(vehicleId, driverId) {
  const vehicle = await vehicleRepository.findById(vehicleId);
  if (!vehicle || vehicle.driverId !== driverId) {
    throw ApiError.notFound("Vehicle not found");
  }
  return vehicle;
}

export async function list(userId) {
  const driverId = await getOwnDriverId(userId);
  return vehicleRepository.listByDriver(driverId);
}

export async function get(userId, vehicleId) {
  const driverId = await getOwnDriverId(userId);
  return getOwnVehicle(vehicleId, driverId);
}

export async function create(userId, data) {
  const driverId = await getOwnDriverId(userId);
  return vehicleRepository.create(driverId, data);
}

/**
 * Editing a verified vehicle's identity (plate, make/model/year) means
 * what an admin actually verified no longer matches what's on file — the
 * verification has to be re-earned, not silently carried over.
 */
export async function update(userId, vehicleId, data) {
  const driverId = await getOwnDriverId(userId);
  const vehicle = await getOwnVehicle(vehicleId, driverId);

  const touchesIdentity = IDENTITY_FIELDS.some((field) => field in data);
  const payload = touchesIdentity && vehicle.isVerified ? { ...data, isVerified: false } : data;

  return vehicleRepository.update(vehicleId, payload);
}

export async function deactivate(userId, vehicleId) {
  const driverId = await getOwnDriverId(userId);
  await getOwnVehicle(vehicleId, driverId);
  await vehicleRepository.deactivate(vehicleId);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function addDocument(userId, vehicleId, { type, expiryDate, fileKey }) {
  const driverId = await getOwnDriverId(userId);
  await getOwnVehicle(vehicleId, driverId);
  return vehicleDocumentRepository.create({ vehicleId, type, fileUrl: fileKey, expiryDate });
}

export async function listDocuments(userId, vehicleId) {
  const driverId = await getOwnDriverId(userId);
  const vehicle = await getOwnVehicle(vehicleId, driverId);
  return vehicle.documents;
}

export async function removeDocument(userId, vehicleId, documentId) {
  const driverId = await getOwnDriverId(userId);
  await getOwnVehicle(vehicleId, driverId);

  const document = await vehicleDocumentRepository.findById(documentId);
  if (!document || document.vehicleId !== vehicleId) {
    throw ApiError.notFound("Document not found");
  }
  if (document.status === "APPROVED") {
    throw ApiError.conflict("An approved document cannot be removed directly — contact support");
  }

  await vehicleDocumentRepository.remove(documentId);
  deleteFile(document.fileUrl);
}

/**
 * Shared by the driver's own download endpoint and the admin review
 * endpoint — access is either "you own the vehicle this document belongs
 * to" or "you're an admin", nothing in between.
 */
export async function getDocumentForDownload(documentId, requester) {
  const document = await vehicleDocumentRepository.findById(documentId);
  if (!document) {
    throw ApiError.notFound("Document not found");
  }

  if (requester.role === "ADMIN") return document;

  const driver = await driverRepository.findByUserId(requester.userId);
  if (!driver || document.vehicle.driverId !== driver.id) {
    throw ApiError.forbidden("You do not have access to this document");
  }

  return document;
}
