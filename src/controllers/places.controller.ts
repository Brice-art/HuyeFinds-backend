import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

// ------------------------------------------------------------
// GET /api/places  — list + filter + search
// ------------------------------------------------------------

const listQuerySchema = z.object({
  category: z.string().trim().optional(), // top-level category slug
  subcategory: z.string().trim().optional(), // leaf subcategory slug
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
    // `subcategory` filters to one leaf; `category` (with no subcategory
    // given) filters to every place under any of that category's
    // subcategories.
    ...(q.subcategory ? { subcategory: { slug: q.subcategory } } : {}),
    ...(q.category && !q.subcategory
      ? { subcategory: { category: { slug: q.category } } }
      : {}),
    ...(q.featured !== undefined ? { isFeatured: q.featured } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: "insensitive" as const } },
            {
              description: { contains: q.search, mode: "insensitive" as const },
            },
            {
              menuItems: {
                some: {
                  name: {
                    contains: q.search,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
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
        subcategory: {
          select: {
            name: true,
            slug: true,
            icon: true,
            category: { select: { name: true, slug: true } },
          },
        },
        images: { where: { isCover: true }, take: 1 },
      },
    }),
    prisma.place.count({ where }),
  ]);

  let favoritedIds = new Set<string>();
  if (req.user) {
    const favs = await prisma.favorite.findMany({
      where: {
        userId: req.user.userId,
        placeId: { in: items.map((p) => p.id) },
      },
      select: { placeId: true },
    });
    favoritedIds = new Set(favs.map((f) => f.placeId));
  }

  const itemsWithFavorite = items.map((place) => ({
    ...place,
    isFavorited: favoritedIds.has(place.id),
  }));

  res.json({
    items: itemsWithFavorite,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
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
      subcategory: { include: { category: true } },
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

  const place = await prisma.place.findUnique({
    where: { slug },
    select: {
      id: true,
      subcategory: {
        select: {
          categoryId: true,
        },
      },
    },
  });
  if (!place) throw new AppError("Place not found", 404);

  const similar = await prisma.place.findMany({
    where: {
      subcategory: {
        categoryId: place.subcategory.categoryId,
      },
      isActive: true,
      id: { not: place.id },
    },
    take: 4,
    orderBy: {
      ratingAvg: "desc",
    },
    include: {
      subcategory: {
        select: {
          name: true,
          slug: true,
          icon: true,
          category: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
      images: {
        where: {
          isCover: true,
        },
        take: 1,
      },
    },
  });

  let favoritedIds = new Set<string>();
  if (req.user) {
    const favs = await prisma.favorite.findMany({
      where: {
        userId: req.user.userId,
        placeId: { in: similar.map((p) => p.id) },
      },
      select: { placeId: true },
    });
    favoritedIds = new Set(favs.map((f) => f.placeId));
  }

  res.json({
    items: similar.map((p) => ({ ...p, isFavorited: favoritedIds.has(p.id) })),
  });
}

// ------------------------------------------------------------
// POST /api/places  — OWNER/ADMIN only
// ------------------------------------------------------------

const dayOfWeekEnum = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const createPlaceSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(140)
      .regex(
        /^[a-z0-9-]+$/,
        "slug must be lowercase letters, numbers, and hyphens only",
      ),
    description: z.string().trim().min(10).max(2000),
    subcategoryId: z.string().cuid(),
    priceMin: z.number().int().min(0),
    priceMax: z.number().int().min(0),
    contactPhone: z.string().trim().min(7).max(20),
    contactPhone2: z.string().trim().min(7).max(20).optional(),
    landmark: z.string().trim().min(2).max(160),
    images: z
      .array(
        z.object({
          url: z.string().url(),
          altText: z.string().trim().max(200).optional(),
        }),
      )
      .max(10)
      .optional(),
    menuItems: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          price: z.number().int().min(0),
          note: z.string().trim().max(200).optional(),
        }),
      )
      .max(50)
      .optional(),
    // All 7 days, or none — partial weeks create ambiguity about whether a
    // missing day means "closed" or "not entered yet".
    hours: z
      .array(
        z.object({
          dayOfWeek: dayOfWeekEnum,
          openTime: z.string().trim().max(10).optional(),
          closeTime: z.string().trim().max(10).optional(),
          isClosed: z.boolean().default(false),
        }),
      )
      .length(7)
      .optional(),
  })
  .refine((data) => data.priceMax >= data.priceMin, {
    message: "priceMax must be greater than or equal to priceMin",
    path: ["priceMax"],
  });

export async function createPlace(req: Request, res: Response) {
  console.log("Raw req.body.images:", req.body.images);
  const data = createPlaceSchema.parse(req.body);
  console.log("Parsed images:", data.images);
  const { images, menuItems, hours, ...placeFields } = data;

  const place = await prisma.place.create({
    data: {
      ...placeFields,
      ownerId: req.user!.userId,
      images: images
        ? {
            create: images.map((img, i) => ({
              url: img.url,
              altText: img.altText ?? "",
              isCover: i === 0,
              sortOrder: i,
            })),
          }
        : undefined,
      menuItems: menuItems
        ? { create: menuItems.map((item, i) => ({ ...item, sortOrder: i })) }
        : undefined,
      hours: hours ? { create: hours } : undefined,
    },
    include: { images: true, menuItems: true, hours: true },
  });

  res.status(201).json(place);
}
