import { Router } from "express";
import { deleteReview, upsertReview } from "../controllers/reviews.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";

export const reviewsRouter = Router();

reviewsRouter.use(requireAuth);
reviewsRouter.post("/", asyncHandler(upsertReview));
reviewsRouter.delete("/:placeId", asyncHandler(deleteReview));
