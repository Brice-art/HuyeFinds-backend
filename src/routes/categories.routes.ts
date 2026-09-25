import { Router } from "express";
import { listCategories } from "../controllers/categories.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { publicCache } from "../middleware/cache.middleware";

export const categoriesRouter = Router();

// Categories are identical for every visitor and rarely change.
categoriesRouter.get("/", publicCache(300), asyncHandler(listCategories));
