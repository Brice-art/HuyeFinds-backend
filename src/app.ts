import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.routes";
import { placesRouter } from "./routes/places.routes";
import { categoriesRouter } from "./routes/categories.routes";
import { favoritesRouter } from "./routes/favorites.routes";
import { reviewsRouter } from "./routes/reviews.routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { imagesRouter } from "./routes/images.routes";
import { uploadsRouter } from "./routes/uploads.routes";
import { hubPostsRouter } from "./routes/hubPosts.routes";
import { ogRouter } from "./routes/og.routes";
import { adminRouter } from "./routes/admin.routes";
import compression from "compression";

export const app = express();

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down and try again in a minute.",
  },
});

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no Origin header, such as Postman. Also allow
      // localhost/127.0.0.1 variations that Vite commonly uses in dev.
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.replace(/\/$/, "");
      if (
        allowedOrigins.includes(normalizedOrigin) ||
        /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(normalizedOrigin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// app.use(
//   cors({
//     origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
//     credentials: true,
//   }),
// );
app.use(express.json());
// gzip/brotli every response — place lists especially, which carry
// several images[] arrays of URLs per item and add up fast uncompressed.
app.use(compression());
app.use(apiLimiter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Open Graph HTML for link previews (WhatsApp, etc.)
app.use("/og", ogRouter);

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/places", placesRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/hub-posts", hubPostsRouter);
app.use("/api/places/:placeId/images", imagesRouter);
app.use("/api/uploads", uploadsRouter);

// Must be registered last, in this order: 404 handler, then error handler.
app.use(notFoundHandler);
app.use(errorHandler);
