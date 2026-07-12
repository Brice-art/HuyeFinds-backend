import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

// Express doesn't catch rejected promises from async route handlers on its
// own (pre-Express 5) — without this, a thrown error inside an `async`
// controller just hangs the request instead of reaching your error
// middleware. Wrap every async controller in this.
export const asyncHandler =
  (fn: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
