import { ApiResponse } from "../utils/ApiResponse.js";
import * as adminService from "../services/admin.service.js";

export async function listUsers(req, res) {
  const { users, pagination } = await adminService.listUsers(req.query);
  res.status(200).json(new ApiResponse(200, { users, pagination }));
}

export async function getUserById(req, res) {
  const user = await adminService.getUserById(req.params.id);
  res.status(200).json(new ApiResponse(200, user));
}

export async function updateUserStatus(req, res) {
  const user = await adminService.setUserActiveStatus(req.params.id, req.body.isActive, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json(new ApiResponse(200, user, "User status updated"));
}
