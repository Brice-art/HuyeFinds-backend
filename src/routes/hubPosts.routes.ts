import { Router } from "express";
import {
  createHubPost,
  deleteHubPost,
  listHubPosts,
} from "../controllers/hubPosts.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const hubPostsRouter = Router();

hubPostsRouter.get("/", asyncHandler(listHubPosts)); // public — anyone can browse
hubPostsRouter.post("/", requireAuth, asyncHandler(createHubPost));
hubPostsRouter.delete("/:id", requireAuth, asyncHandler(deleteHubPost));
