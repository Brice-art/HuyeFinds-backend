import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { placesRouter } from "./routes/places.routes";
import { categoriesRouter } from "./routes/categories.routes";
import { favoritesRouter } from "./routes/favorites.routes";
import { reviewsRouter } from "./routes/reviews.routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { imagesRouter } from "./routes/images.routes";
import { uploadsRouter } from "./routes/uploads.routes";

export const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/places", placesRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/places/:placeId/images", imagesRouter);
app.use("/api/uploads", uploadsRouter);

// Must be registered last, in this order: 404 handler, then error handler.
app.use(notFoundHandler);
app.use(errorHandler);
