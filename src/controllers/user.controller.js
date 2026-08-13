import { ApiResponse } from "../utils/ApiResponse.js";
import * as userService from "../services/user.service.js";
import * as savedLocationService from "../services/savedLocation.service.js";
import * as favoriteDriverService from "../services/favoriteDriver.service.js";

export async function getMe(req, res) {
  const user = await userService.getProfile(req.user.id);
  res.status(200).json(new ApiResponse(200, user));
}

export async function updateMe(req, res) {
  const user = await userService.updateProfile(req.user.id, req.body);
  res.status(200).json(new ApiResponse(200, user, "Profile updated"));
}

export async function changePassword(req, res) {
  await userService.changePassword(req.user.id, req.body);
  res.status(200).json(new ApiResponse(200, null, "Password changed. Please log in again."));
}

export async function becomeDriver(req, res) {
  const user = await userService.becomeDriver(req.user.id, req.body);
  res.status(200).json(new ApiResponse(200, user, "Driver profile created"));
}

export async function listSavedLocations(req, res) {
  const locations = await savedLocationService.list(req.user.id);
  res.status(200).json(new ApiResponse(200, locations));
}

export async function createSavedLocation(req, res) {
  const location = await savedLocationService.create(req.user.id, req.body);
  res.status(201).json(new ApiResponse(201, location, "Saved location created"));
}

export async function updateSavedLocation(req, res) {
  const location = await savedLocationService.update(req.user.id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, location, "Saved location updated"));
}

export async function deleteSavedLocation(req, res) {
  await savedLocationService.remove(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, null, "Saved location deleted"));
}

export async function listFavoriteDrivers(req, res) {
  const drivers = await favoriteDriverService.list(req.user.id);
  res.status(200).json(new ApiResponse(200, drivers));
}

export async function addFavoriteDriver(req, res) {
  const favorite = await favoriteDriverService.add(req.user.id, req.body.driverId);
  res.status(201).json(new ApiResponse(201, favorite, "Driver added to favorites"));
}

export async function removeFavoriteDriver(req, res) {
  await favoriteDriverService.remove(req.user.id, req.params.driverId);
  res.status(200).json(new ApiResponse(200, null, "Driver removed from favorites"));
}
