import { Router } from "express";
import { listMyFavorites, toggleFavorite } from "../controllers/favorites.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";

export const favoritesRouter = Router();

favoritesRouter.use(requireAuth); // every route below requires login
favoritesRouter.get("/", asyncHandler(listMyFavorites));
favoritesRouter.post("/toggle", asyncHandler(toggleFavorite));
