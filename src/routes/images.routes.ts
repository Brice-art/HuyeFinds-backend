import { Router } from "express";
import { deletePlaceImage, uploadPlaceImage } from "../controllers/images.controller";
import { upload } from "../middleware/upload.middleware";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

// mergeParams: true — without it, this router can't see :placeId from the
// parent path it gets mounted under in app.ts.
export const imagesRouter = Router({ mergeParams: true });

imagesRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

imagesRouter.post("/", upload.single("image"), asyncHandler(uploadPlaceImage));
imagesRouter.delete("/:imageId", asyncHandler(deletePlaceImage));