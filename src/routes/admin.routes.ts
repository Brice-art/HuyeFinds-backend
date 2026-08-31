import { Router } from "express";
import {
  approveHubPost,
  getAdminOverview,
  rejectHubPost,
} from "../controllers/admin.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));
adminRouter.get("/overview", asyncHandler(getAdminOverview));
adminRouter.patch("/hub-posts/:id/approve", asyncHandler(approveHubPost));
adminRouter.delete("/hub-posts/:id/reject", asyncHandler(rejectHubPost));
