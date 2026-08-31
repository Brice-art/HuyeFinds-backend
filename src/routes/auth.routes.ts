import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  forgotPassword,
  login,
  me,
  register,
  resetPassword,
} from "../controllers/auth.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";

export const authRouter = Router();

const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.ip ?? "unknown",
  message: {
    error: "Too many login attempts. Please wait 15 minutes before trying again.",
  },
});

authRouter.post("/register", authLoginLimiter, asyncHandler(register));
authRouter.post("/login", authLoginLimiter, asyncHandler(login));
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.post("/forgot-password", authLoginLimiter, asyncHandler(forgotPassword));
authRouter.post("/reset-password", authLoginLimiter, asyncHandler(resetPassword));
