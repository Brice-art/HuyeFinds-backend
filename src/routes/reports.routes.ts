import { Router } from "express";
import { createReport } from "../controllers/reports.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const reportsRouter = Router();

reportsRouter.post("/", requireAuth, asyncHandler(createReport));