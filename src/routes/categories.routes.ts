import { Router } from "express";
import { listCategories } from "../controllers/categories.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const categoriesRouter = Router();

categoriesRouter.get("/", asyncHandler(listCategories));
