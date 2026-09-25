import { Router } from "express";
import {
  createHubPost,
  updateHubPost,
  createHubPostComment,
  deleteHubPost,
  getHubPostById,
  getHubPostStats,
  listHubPostComments,
  listHubPosts,
  toggleHubPostLike,
  toggleHubPostPin,
  toggleHubPostSave,
} from "../controllers/hubPosts.controller";
import {
  attachUserIfPresent,
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { publicCache } from "../middleware/cache.middleware";

export const hubPostsRouter = Router();

// /stats MUST come before /:id — Express matches in registration order,
// and /:id would otherwise swallow "stats" as if it were an id.
hubPostsRouter.get("/stats", publicCache(60), asyncHandler(getHubPostStats));

hubPostsRouter.get("/", publicCache(30), attachUserIfPresent, asyncHandler(listHubPosts));
hubPostsRouter.get("/:id", attachUserIfPresent, asyncHandler(getHubPostById));
hubPostsRouter.patch("/:id", requireAuth, asyncHandler(updateHubPost));
hubPostsRouter.post("/", requireAuth, asyncHandler(createHubPost));
hubPostsRouter.delete("/:id", requireAuth, asyncHandler(deleteHubPost));
hubPostsRouter.patch(
  "/:id/pin",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(toggleHubPostPin),
);

hubPostsRouter.post("/:id/like", requireAuth, asyncHandler(toggleHubPostLike));
hubPostsRouter.post("/:id/save", requireAuth, asyncHandler(toggleHubPostSave));

hubPostsRouter.get("/:id/comments", asyncHandler(listHubPostComments));
hubPostsRouter.post(
  "/:id/comments",
  requireAuth,
  asyncHandler(createHubPostComment),
);
