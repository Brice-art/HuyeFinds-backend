import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route: ${req.method} ${req.originalUrl}` });
}

// Keep this LAST in app.use() order — Express identifies error middleware
// by arity (4 params), so the signature must stay exactly this shape.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.flatten().fieldErrors,
    });
  }

  // Prisma throws a runtime error object with a `code` property for known errors.
  // Narrow `err` safely and check the code string rather than relying on
  // `instanceof` against generated Prisma types (which may not exist at runtime).
  if (typeof err === "object" && err !== null && "code" in err) {
    const pErr = err as { code?: string };
    if (pErr.code === "P2002") {
      return res.status(409).json({ error: "A record with that value already exists" });
    }
    if (pErr.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Anything unrecognized is a bug, not user error — log the real thing
  // server-side, never leak stack traces or Prisma internals to the client.
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}
