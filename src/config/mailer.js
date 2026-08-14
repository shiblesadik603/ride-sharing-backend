import nodemailer from "nodemailer";
import { env } from "./env.js";

const hasSmtpConfig = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);

/**
 * `null` when SMTP isn't configured — email.service checks this and logs
 * instead of sending, so registration/password-reset flows work in local
 * dev without every engineer needing real mail provider credentials.
 */
export const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // No timeout previously meant an unresponsive SMTP server could
      // hang sendMail() indefinitely — which, since this only ever runs
      // inside the email job processor, would hold that job's BullMQ
      // lock (and a worker slot) hostage for as long as the connection
      // stayed open. These three cover connection setup, the initial
      // SMTP greeting, and overall socket inactivity respectively — worst
      // case, all three stack to under 30s, which is what
      // jobs/processors/email.processor.js's own lockDuration is sized
      // against.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    })
  : null;
