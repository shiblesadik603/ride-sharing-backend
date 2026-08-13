import path from "node:path";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { UPLOAD_ROOT, resolvePath } from "../config/storage.js";
import * as vehicleService from "../services/vehicle.service.js";

export async function list(req, res) {
  const vehicles = await vehicleService.list(req.user.id);
  res.status(200).json(new ApiResponse(200, vehicles));
}

export async function get(req, res) {
  const vehicle = await vehicleService.get(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, vehicle));
}

export async function create(req, res) {
  const vehicle = await vehicleService.create(req.user.id, req.body);
  res.status(201).json(new ApiResponse(201, vehicle, "Vehicle added"));
}

export async function update(req, res) {
  const vehicle = await vehicleService.update(req.user.id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, vehicle, "Vehicle updated"));
}

export async function remove(req, res) {
  await vehicleService.deactivate(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, null, "Vehicle deactivated"));
}

export async function uploadDocument(req, res) {
  if (!req.file) {
    throw ApiError.badRequest("A document file is required");
  }

  const fileKey = path.relative(UPLOAD_ROOT, req.file.path);
  const document = await vehicleService.addDocument(req.user.id, req.params.id, {
    type: req.body.type,
    expiryDate: req.body.expiryDate,
    fileKey,
  });

  res.status(201).json(new ApiResponse(201, document, "Document uploaded"));
}

export async function listDocuments(req, res) {
  const documents = await vehicleService.listDocuments(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, documents));
}

export async function removeDocument(req, res) {
  await vehicleService.removeDocument(req.user.id, req.params.id, req.params.documentId);
  res.status(200).json(new ApiResponse(200, null, "Document removed"));
}

export async function downloadDocument(req, res) {
  const document = await vehicleService.getDocumentForDownload(req.params.documentId, {
    userId: req.user.id,
    role: req.user.role,
  });
  res.sendFile(resolvePath(document.fileUrl));
}
