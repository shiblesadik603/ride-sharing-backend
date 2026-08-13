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
    })
  : null;
