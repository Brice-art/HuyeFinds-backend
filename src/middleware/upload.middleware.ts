import multer from "multer";
import { AppError } from "../utils/AppError";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const upload = multer({
  // Memory storage keeps the file as a Buffer in RAM rather than writing
  // to disk — fine at this size limit since we immediately stream it to
  // Cloudinary and never need it again. Don't reuse this pattern for
  // much larger files without switching to disk storage or a streamed
  // multipart parser.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new AppError("Only JPEG, PNG, and WebP images are allowed", 400));
    }
    cb(null, true);
  },
});