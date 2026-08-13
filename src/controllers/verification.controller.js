import { ApiResponse } from "../utils/ApiResponse.js";
import { resolvePath } from "../config/storage.js";
import * as verificationService from "../services/verification.service.js";
import * as vehicleService from "../services/vehicle.service.js";

function actorFrom(req) {
  return { id: req.user.id, ipAddress: req.ip };
}

export async function listDrivers(req, res) {
  const { drivers, pagination } = await verificationService.listDrivers(req.query);
  res.status(200).json(new ApiResponse(200, { drivers, pagination }));
}

export async function getDriver(req, res) {
  const driver = await verificationService.getDriverById(req.params.id);
  res.status(200).json(new ApiResponse(200, driver));
}

export async function reviewDriver(req, res) {
  const driver = await verificationService.reviewDriver(
    req.params.id,
    req.body.verificationStatus,
    req.body.reason,
    actorFrom(req)
  );
  res.status(200).json(new ApiResponse(200, driver, "Driver verification updated"));
}

export async function reviewVehicle(req, res) {
  const vehicle = await verificationService.reviewVehicle(
    req.params.id,
    req.body.isVerified,
    actorFrom(req)
  );
  res.status(200).json(new ApiResponse(200, vehicle, "Vehicle verification updated"));
}

export async function reviewDocument(req, res) {
  const document = await verificationService.reviewDocument(
    req.params.id,
    req.body.status,
    actorFrom(req)
  );
  res.status(200).json(new ApiResponse(200, document, "Document review recorded"));
}

export async function downloadDocument(req, res) {
  const document = await vehicleService.getDocumentForDownload(req.params.id, {
    userId: req.user.id,
    role: req.user.role,
  });
  res.sendFile(resolvePath(document.fileUrl));
}
