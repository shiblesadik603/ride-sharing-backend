import { transporter } from "../config/mailer.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Sends immediately (awaited by the caller). This is the one place in the
 * codebase where "just call BullMQ" would be the textbook answer — and
 * deliberately isn't, yet: introducing a queue/worker before Phase
 * "Notifications & Background Jobs" would mean debugging Redis-backed job
 * infrastructure while still trying to ship register/reset-password. The
 * fix, when we get there, is entirely inside this file: swap the body of
 * `send()` for `emailQueue.add(...)` — nothing calling `sendVerification
 * Email`/`sendPasswordResetEmail` has to change.
 */
async function send({ to, subject, html }) {
  if (!transporter) {
    logger.info(`[email:dev] would send "${subject}" to ${to}`, { html });
    return;
  }

  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html });
}

export async function sendVerificationEmail(to, token) {
  const link = `${env.CLIENT_URL}/verify-email?token=${token}`;
  await send({
    to,
    subject: "Verify your email",
    html: `<p>Welcome to Ride Sharing. Confirm your email address to activate your account:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(to, token) {
  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
  await send({
    to,
    subject: "Reset your password",
    html: `<p>We received a request to reset your password.</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}
