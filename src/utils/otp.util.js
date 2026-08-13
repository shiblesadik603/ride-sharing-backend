import crypto from "node:crypto";

/**
 * A 4-digit ride-start OTP, not a security token in the JWT/session sense —
 * it's stored in plaintext on the Ride row deliberately. It exists to
 * confirm physical proximity (passenger reads it off their screen, says it
 * out loud, driver types it in), not to resist offline brute force the way
 * a password or refresh token must. Online brute force is mitigated in
 * ride.service.js by a per-ride attempt counter, not by the OTP's own entropy.
 */
export function generateOtp() {
  return String(crypto.randomInt(1000, 10000));
}
