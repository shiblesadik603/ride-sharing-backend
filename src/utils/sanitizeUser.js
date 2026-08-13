/**
 * Strips fields that should never leave the server (password hash, and
 * Google's internal subject id) before a User row is put in an API response.
 */
export function sanitizeUser(user) {
  const { passwordHash, googleId, ...safe } = user;
  return safe;
}
