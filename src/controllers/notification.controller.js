import { ApiResponse } from "../utils/ApiResponse.js";
import * as notificationService from "../services/notification.service.js";

export async function list(req, res) {
  const result = await notificationService.listMyNotifications(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, result));
}

export async function markRead(req, res) {
  const notification = await notificationService.markNotificationRead(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, notification, "Notification marked as read"));
}
