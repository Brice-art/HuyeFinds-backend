import { Router } from "express";
import {
  approveClaim,
  approveEditRequest,
  approveHubPost,
  dismissReport,
  getAdminOverview,
  listAdminPlaces,
  listClaims,
  listEditRequests,
  listReports,
  rejectClaim,
  rejectEditRequest,
  rejectHubPost,
  removeHubPost,
  resolveReport,
  setPlaceModeration,
  setPlaceVerification,
} from "../controllers/admin.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const adminRouter = Router();

// Every admin route is protected here — a STUDENT or OWNER token can never
// reach a handler below, regardless of what the frontend shows.
adminRouter.use(requireAuth, requireRole("ADMIN"));

adminRouter.get("/overview", asyncHandler(getAdminOverview));

// Student Hub post moderation
adminRouter.patch("/hub-posts/:id/approve", asyncHandler(approveHubPost));
adminRouter.delete("/hub-posts/:id/reject", asyncHandler(rejectHubPost));
adminRouter.patch("/hub-posts/:id/remove", asyncHandler(removeHubPost));

// Place verification & listing management
adminRouter.get("/places", asyncHandler(listAdminPlaces));
adminRouter.patch(
  "/places/:id/verification",
  asyncHandler(setPlaceVerification),
);
// Place approval workflow — new submissions are PENDING until an admin
// approves (APPROVED) or rejects (REJECTED) them here.
adminRouter.patch(
  "/places/:id/moderation",
  asyncHandler(setPlaceModeration),
);

// Restaurant ownership claims
adminRouter.get("/claims", asyncHandler(listClaims));
adminRouter.patch("/claims/:id/approve", asyncHandler(approveClaim));
adminRouter.delete("/claims/:id/reject", asyncHandler(rejectClaim));

// Reported content
adminRouter.get("/reports", asyncHandler(listReports));
adminRouter.patch("/reports/:id/resolve", asyncHandler(resolveReport));
adminRouter.delete("/reports/:id/dismiss", asyncHandler(dismissReport));

// High-risk place update requests
adminRouter.get("/edit-requests", asyncHandler(listEditRequests));
adminRouter.patch(
  "/edit-requests/:id/approve",
  asyncHandler(approveEditRequest),
);
adminRouter.delete(
  "/edit-requests/:id/reject",
  asyncHandler(rejectEditRequest),
);