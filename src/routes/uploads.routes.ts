import { Router } from "express";
import { uploadStagingImage } from "../controllers/images.controller";
import { upload } from "../middleware/upload.middleware";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const uploadsRouter = Router();

uploadsRouter.post(
  "/image",
  requireAuth,
  requireRole("OWNER", "ADMIN"),
  upload.single("image"),
  asyncHandler(uploadStagingImage)
);