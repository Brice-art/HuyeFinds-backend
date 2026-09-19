import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { prisma } from "../lib/prisma";

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

// Use on routes that MUST have a logged-in user (e.g. POST /favorites).
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return next(new AppError("Authentication required", 401));
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}

// Use on routes that work for anyone but change behavior when logged in
// (e.g. GET /places/:id returning isFavorited: true/false).
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Invalid token on an optional-auth route — proceed as anonymous
      // rather than blocking the request.
    }
  }
  next();
}

// Use after requireAuth on routes restricted to specific roles. The role is
// re-read from the database rather than trusting the (possibly stale) JWT
// claim — a user promoted to OWNER by a claim approval, demoted, or otherwise
// re-rolled must have that take effect on the next request, and a leaked
// token must never outlive a role change.
export function requireRole(...roles: Array<"STUDENT" | "OWNER" | "ADMIN">) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new AppError("You don't have permission to do this", 403));
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { role: true },
      });

      if (!user || !roles.includes(user.role)) {
        return next(new AppError("You don't have permission to do this", 403));
      }

      // Keep the JWT payload's role in sync so downstream code (which reads
      // req.user.role) sees the same role the DB check just authorized.
      req.user.role = user.role;

      next();
    } catch {
      next(new AppError("You don't have permission to do this", 403));
    }
  };
}
