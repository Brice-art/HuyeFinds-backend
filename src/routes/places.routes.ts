import { Router } from "express";
import {
  claimPlace,
  createPlace,
  createPlaceEditRequest,
  getMyPlaces,
  getPlaceBySlug,
  getRecommendedPlaces,
  getSimilarPlaces,
  listPlaces,
  updatePlace,
} from "../controllers/places.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { attachUserIfPresent, requireAuth, requireRole } from "../middleware/auth.middleware";
import { publicCache } from "../middleware/cache.middleware";

export const placesRouter = Router();

// Browser/CDN caches: public lists and detail pages are identical for
// anonymous visitors for a short window; authenticated requests bypass the
// header entirely (their payloads include isFavorited state).
placesRouter.get("/", publicCache(60), attachUserIfPresent, asyncHandler(listPlaces));
placesRouter.get("/mine", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(getMyPlaces));
// Must be registered before the /:slug routes so "recommended" isn't
// captured as a place slug.
placesRouter.get("/recommended", publicCache(60), attachUserIfPresent, asyncHandler(getRecommendedPlaces));
placesRouter.get("/:slug", publicCache(60), attachUserIfPresent, asyncHandler(getPlaceBySlug));
placesRouter.get("/:slug/similar", publicCache(600), attachUserIfPresent, asyncHandler(getSimilarPlaces));
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
