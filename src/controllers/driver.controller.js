import { ApiResponse } from "../utils/ApiResponse.js";
import * as driverService from "../services/driver.service.js";

export async function goOnline(req, res) {
  const result = await driverService.goOnline(req.user.id, req.body);
  res.status(200).json(new ApiResponse(200, result, "You are now online"));
}

export async function goOffline(req, res) {
  const result = await driverService.goOffline(req.user.id);
  res.status(200).json(new ApiResponse(200, result, "You are now offline"));
}

export async function updateLocation(req, res) {
  await driverService.updateLocation(req.user.id, req.body);
  res.status(200).json(new ApiResponse(200, null, "Location updated"));
}
