import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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
  // express-rate-limit v8 validates custom keyGenerators that touch the IP:
  // raw req.ip must be wrapped with ipKeyGenerator() so IPv6 clients are
  // bucketed by /64 subnet instead of the full address, otherwise the server
  // throws ERR_ERL_KEY_GEN_IPV6 on startup.
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  message: {
    error: "Too many login attempts. Please wait 15 minutes before trying again.",
  },
});

authRouter.post("/register", authLoginLimiter, asyncHandler(register));
authRouter.post("/login", authLoginLimiter, asyncHandler(login));
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.post("/forgot-password", authLoginLimiter, asyncHandler(forgotPassword));
authRouter.post("/reset-password", authLoginLimiter, asyncHandler(resetPassword));
