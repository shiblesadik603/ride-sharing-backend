import crypto from "node:crypto";

/**
 * For high-entropy secrets (refresh tokens, email/reset tokens) SHA-256 is
 * the right hash — unlike passwords, these aren't guessable by brute force
 * regardless of hash speed, so we don't need bcrypt's deliberate slowness.
 * We only ever store the hash; the raw value exists on the wire once.
 */
export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
