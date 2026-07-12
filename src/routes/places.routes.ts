import { Router } from "express";
import {
  createPlace,
  getPlaceBySlug,
  getSimilarPlaces,
  listPlaces,
} from "../controllers/places.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { attachUserIfPresent, requireAuth, requireRole } from "../middleware/auth.middleware";

export const placesRouter = Router();

placesRouter.get("/", asyncHandler(listPlaces));
placesRouter.get("/:slug", attachUserIfPresent, asyncHandler(getPlaceBySlug));
placesRouter.get("/:slug/similar", asyncHandler(getSimilarPlaces));
placesRouter.post("/", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(createPlace));
