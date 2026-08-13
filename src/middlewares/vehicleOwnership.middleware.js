import * as vehicleService from "../services/vehicle.service.js";

/**
 * Confirms the vehicle in the URL belongs to the caller *before* any
 * multipart body is parsed. Used ahead of the document-upload route so a
 * driver can't even get multer to write a file to disk for a vehicle that
 * isn't theirs — params are available pre-multer, so this check costs
 * nothing to run first.
 */
export async function requireOwnVehicle(req, res, next) {
  req.vehicle = await vehicleService.get(req.user.id, req.params.id);
  next();
}
