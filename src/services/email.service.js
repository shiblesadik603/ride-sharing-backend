import { env } from "../config/env.js";
import * as notificationService from "./notification.service.js";

/**
 * This is the swap promised back in Phase 2: sending used to happen
 * synchronously, right here. Now it's `notificationService.notify(...)`,
 * which persists a Notification row and hands the actual SMTP call to
 * `jobs/processors/email.processor.js` — queued, retried automatically on
 * transient failure, and recorded as SENT/FAILED once the worker finishes.
 *
 * One real change from the Phase 2 version: these now take the full
 * `user` object instead of just an email string, because the Notification
 * row needs a userId to attach to — not a change worth avoiding a genuine
 * improvement over, but worth being upfront that "nothing has to change"
 * undersold it slightly.
 */
export async function sendVerificationEmail(user, token) {
  const link = `${env.CLIENT_URL}/verify-email?token=${token}`;
  await notificationService.notify({
    userId: user.id,
    email: user.email,
    channel: "EMAIL",
    title: "Verify your email",
    html: `<p>Welcome to Ride Sharing. Confirm your email address to activate your account:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(user, token) {
  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
  await notificationService.notify({
    userId: user.id,
    email: user.email,
    channel: "EMAIL",
    title: "Reset your password",
    html: `<p>We received a request to reset your password.</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}
