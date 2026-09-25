import { NextFunction, Request, Response } from "express";

// Attaches a public Cache-Control header to read-only responses that are
// identical for every visitor. Skipped when the request carries an
// Authorization header: authenticated payloads include user-specific state
// (isFavorited, saved flags, moderation views) and must never be served from
// a shared cache. Vary: Authorization keeps the two variants apart in any
// cache that sees both.
export function publicCache(maxAgeSeconds: number) {
  const staleWhileRevalidate = maxAgeSeconds * 10;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.headers.authorization) return next();

    res.set(
      "Cache-Control",
      `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidate}`,
    );
    res.set("Vary", "Authorization");
    next();
  };
}