import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

// ------------------------------------------------------------
// GET /api/places  — list + filter + search
// ------------------------------------------------------------

const listQuerySchema = z.object({
  category: z.string().trim().optional(),      // category slug
  search: z.string().trim().max(120).optional(),
  featured: z.coerce.boolean().optional(),
  sort: z.enum(["recent", "rating", "favorites"]).default("recent"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const ORDER_BY = {
  recent: [{ isFeatured: "desc" as const }, { createdAt: "desc" as const }],
  rating: [{ ratingAvg: "desc" as const }, { reviewCount: "desc" as const }],
  favorites: [{ favoriteCount: "desc" as const }],
};

export async function listPlaces(req: Request, res: Response) {
  const q = listQuerySchema.parse(req.query);

  const where = {
    isActive: true,
    ...(q.category ? { category: { slug: q.category } } : {}),
    ...(q.featured !== undefined ? { isFeatured: q.featured } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: "insensitive" as const } },
            { description: { contains: q.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.place.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: ORDER_BY[q.sort],
      include: {
        category: { select: { name: true, slug: true, icon: true } },
        images: { where: { isCover: true }, take: 1 },
      },
    }),
    prisma.place.count({ where }),
  ]);

  res.json({
    items,
    pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
}

// ------------------------------------------------------------
// GET /api/places/:slug  — full detail
// ------------------------------------------------------------

export async function getPlaceBySlug(req: Request, res: Response) {
  const { slug } = req.params;

  const place = await prisma.place.findUnique({
    where: { slug },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
      menuItems: { orderBy: { sortOrder: "asc" } },
      hours: true,
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { user: { select: { name: true } } },
      },
    },
  });

  if (!place || !place.isActive) {
    throw new AppError("Place not found", 404);
  }

  // Only computed when a valid token was attached (attachUserIfPresent) —
  // anonymous visitors just get isFavorited: false rather than an error.
  let isFavorited = false;
  if (req.user) {
    const fav = await prisma.favorite.findUnique({
      where: { userId_placeId: { userId: req.user.userId, placeId: place.id } },
    });
    isFavorited = !!fav;
  }

  res.json({ ...place, isFavorited });
}

// ------------------------------------------------------------
// GET /api/places/:slug/similar
// ------------------------------------------------------------

export async function getSimilarPlaces(req: Request, res: Response) {
  const { slug } = req.params;

  const place = await prisma.place.findUnique({ where: { slug }, select: { id: true, categoryId: true } });
  if (!place) throw new AppError("Place not found", 404);

  const similar = await prisma.place.findMany({
    where: { categoryId: place.categoryId, isActive: true, id: { not: place.id } },
    take: 4,
    orderBy: { ratingAvg: "desc" },
    include: { images: { where: { isCover: true }, take: 1 } },
  });

  res.json({ items: similar });
}

// ------------------------------------------------------------
// POST /api/places  — OWNER/ADMIN only
// ------------------------------------------------------------

const createPlaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().trim().min(10).max(2000),
  categoryId: z.string().cuid(),
  priceMin: z.number().int().min(0),
  priceMax: z.number().int().min(0),
  contactPhone: z.string().trim().min(7).max(20),
  contactPhone2: z.string().trim().min(7).max(20).optional(),
  landmark: z.string().trim().min(2).max(160),
}).refine((data) => data.priceMax >= data.priceMin, {
  message: "priceMax must be greater than or equal to priceMin",
  path: ["priceMax"],
});

export async function createPlace(req: Request, res: Response) {
  const data = createPlaceSchema.parse(req.body);

  const place = await prisma.place.create({
    data: { ...data, ownerId: req.user!.userId },
  });

  res.status(201).json(place);
}
