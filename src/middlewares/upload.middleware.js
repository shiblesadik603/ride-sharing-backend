import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { UPLOAD_ROOT, ensureDir } from "../config/storage.js";
import { ApiError } from "../utils/ApiError.js";

const ALLOWED_MIME_TYPES = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    // Scoped by the uploader's own id (set by `authenticate`, which runs
    // before this middleware in every route that uses it) — never by a
    // client-supplied id, so one driver can't write into another's folder.
    const dir = path.join(UPLOAD_ROOT, "vehicle-documents", req.user.id);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Never trust the client's original filename — it's attacker-
    // controlled input and a classic path-traversal/overwrite vector.
    const ext = ALLOWED_MIME_TYPES[file.mimetype];
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  // MulterError's constructor takes (code, field) — it derives `.message`
  // from a fixed lookup table per code, so a custom string in the second
  // slot is stored as `.field` and silently never shown. Throwing our own
  // ApiError instead gets the message we actually want, and the global
  // error handler already knows how to render an ApiError.
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(ApiError.badRequest("Only PDF, JPEG, or PNG files are allowed"));
    return;
  }
  cb(null, true);
}

export const uploadVehicleDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
