import { Router } from "express";
import {
  ogHubPost,
  ogPlace,
  ogStudentsHub,
} from "../controllers/og.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const ogRouter = Router();

ogRouter.get("/places/:slug", asyncHandler(ogPlace));
ogRouter.get("/hub-posts/:id", asyncHandler(ogHubPost));
ogRouter.get("/students-hub", asyncHandler(ogStudentsHub));
