import fs from "node:fs";
import path from "node:path";

/**
 * Local disk storage for dev/small deployments. The one function that
 * would need to change to move to S3/GCS is `resolvePath` (and swapping
 * the multer disk engine for a streaming multipart-to-S3 one) — nothing
 * in the vehicle service/controller layer references the filesystem
 * directly, they only ever see the relative key this module hands back.
 */
export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

export function resolvePath(relativeKey) {
  const resolved = path.resolve(UPLOAD_ROOT, relativeKey);
  if (!resolved.startsWith(UPLOAD_ROOT)) {
    // Defense in depth against a relative key containing "../" segments —
    // should be unreachable since we generate keys ourselves, never from
    // user input, but a storage layer should never trust its own callers.
    throw new Error("Resolved path escapes upload root");
  }
  return resolved;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function deleteFile(relativeKey) {
  fs.rm(resolvePath(relativeKey), { force: true }, () => {});
}
