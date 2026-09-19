import { Router } from "express";
import {
  claimPlace,
  createPlace,
  createPlaceEditRequest,
  getMyPlaces,
  updatePlace,
  getPlaceBySlug,
  getSimilarPlaces,
  listPlaces,
} from "../controllers/places.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { attachUserIfPresent, requireAuth, requireRole } from "../middleware/auth.middleware";

export const placesRouter = Router();

placesRouter.get("/", attachUserIfPresent, asyncHandler(listPlaces));
placesRouter.get("/mine", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(getMyPlaces));
placesRouter.get("/:slug", attachUserIfPresent, asyncHandler(getPlaceBySlug));
placesRouter.get("/:slug/similar", attachUserIfPresent, asyncHandler(getSimilarPlaces));
placesRouter.post("/", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(createPlace));
// Claiming: any authenticated user can request ownership of an unowned place;
// an admin still has to approve it. Ownership is never self-assigned.
placesRouter.post("/:slug/claim", requireAuth, asyncHandler(claimPlace));
// High-risk changes (name, location, phone, ...) go through the review queue.
placesRouter.post(
  "/:slug/edit-requests",
  requireAuth,
  asyncHandler(createPlaceEditRequest),
);
placesRouter.patch(
  "/:slug",
  requireAuth,
  asyncHandler(updatePlace),
);
