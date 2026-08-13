import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { emitToUser } from "../sockets/socket.emitter.js";
import { emailQueue } from "../jobs/queues.js";
import * as notificationRepository from "../repositories/notification.repository.js";

/**
 * The one place every other service goes through to notify a user —
 * callers pick a channel and this decides how that channel actually gets
 * delivered, so a driver-verification email and a password-reset email
 * are dispatched identically instead of each service reinventing it.
 *
 * Every channel gets a persisted Notification row first, regardless of
 * whether delivery is synchronous or queued — it's the audit trail
 * (GET /users/me/notifications) and the target the async paths update
 * when they finish.
 */
export async function notify({ userId, email, channel, title, body, html, data }) {
  const notification = await notificationRepository.create({
    userId,
    channel,
    title,
    body: body ?? title,
    data,
    status: "PENDING",
  });

  if (channel === "EMAIL") {
    // Queued, not sent here — the actual SMTP call (and its retries)
    // happen in jobs/processors/email.processor.js. This function returns
    // as soon as the job is durably written to Redis.
    await emailQueue.add("send-email", {
      notificationId: notification.id,
      to: email,
      subject: title,
      html: html ?? `<p>${body ?? title}</p>`,
    });
    return notification;
  }

  if (channel === "SOCKET") {
    // Fire-and-forget over an already-open connection — nothing here
    // benefits from a queue's durability, so there's nothing to retry.
    emitToUser(userId, "notification", { title, body, data });
    return notificationRepository.markSent(notification.id);
  }

  if (channel === "PUSH") {
    // Honest stub, not a fake success: push requires FCM/APNs project
    // credentials this environment doesn't have. Marking it FAILED
    // immediately (not queuing, not retrying) is more truthful than
    // pretending a retry could ever make it succeed — this is a
    // permanently unconfigured channel, not a transient failure.
    logger.warn("Push notifications are not configured — notification recorded but not delivered", {
      userId,
      title,
    });
    return notificationRepository.markFailed(notification.id);
  }

  throw ApiError.badRequest(`Unsupported notification channel: ${channel}`);
}

export async function listMyNotifications(userId, { page, limit, isRead }) {
  const [notifications, total] = await Promise.all([
    notificationRepository.listByUser(userId, { page, limit, isRead }),
    notificationRepository.countByUser(userId, { isRead }),
  ]);
  return { notifications, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function markNotificationRead(userId, notificationId) {
  const notification = await notificationRepository.findById(notificationId);
  if (!notification || notification.userId !== userId) {
    throw ApiError.notFound("Notification not found");
  }
  return notificationRepository.markRead(notificationId);
}
