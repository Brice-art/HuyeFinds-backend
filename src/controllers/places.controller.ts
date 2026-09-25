import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, DayOfWeek } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { cacheGet, cacheSet, invalidatePlaceCaches } from "../lib/cache";
import { computeIsOpenNow } from "../lib/openNow";
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
    // A SUSPENDED listing is not shown publicly until an admin resolves it.
    verificationStatus: { not: "SUSPENDED" as const },
    // Only admin-approved places appear publicly. New submissions default
    // to PENDING and stay hidden until an admin reviews them.
    moderationStatus: "APPROVED" as const,
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
        hours: true,
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

  // `hours` is used to compute the open/closed flag and then dropped — the
  // full week of times bloats every card payload for a signal cards only
  // need as a boolean.
  const itemsWithFavorite = items.map(({ hours, ...place }) => ({
    ...place,
    isFavorited: favoritedIds.has(place.id),
    isOpenNow: computeIsOpenNow(hours),
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

  if (!place) {
    throw new AppError("Place not found", 404);
  }

  // Public access requires an APPROVED, non-suspended, active listing.
  // Owners and admins may preview their own place while it is pending
  // review (e.g. right after submitting it).
  const publiclyVisible =
    place.isActive &&
    place.verificationStatus !== "SUSPENDED" &&
    place.moderationStatus === "APPROVED";
  const privileged =
    !!req.user &&
    (req.user.role === "ADMIN" || place.ownerId === req.user.userId);

  if (!publiclyVisible && !privileged) {
    throw new AppError("Place not found", 404);
  }

  let isFavorited = false;
  if (req.user) {
    const fav = await prisma.favorite.findUnique({
      where: { userId_placeId: { userId: req.user.userId, placeId: place.id } },
    });
    isFavorited = !!fav;
  }

  res.json({ ...place, isFavorited, isOpenNow: computeIsOpenNow(place.hours) });
}

// ------------------------------------------------------------
// GET /api/places/:slug/similar
// ------------------------------------------------------------

export async function getSimilarPlaces(req: Request, res: Response) {
  const { slug } = req.params;

  // Similar-place recommendations are stable for a given listing, so cache
  // them in memory (10 min) — but only for unauthenticated requests; signed-in
  // visitors need fresh isFavorited flags.
  const cacheKey = `similar:${slug}`;
  if (!req.user) {
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
  }

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
      verificationStatus: { not: "SUSPENDED" },
      moderationStatus: "APPROVED",
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
      hours: true,
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

  const payload = {
    items: similar.map(({ hours, ...p }) => ({
      ...p,
      isFavorited: favoritedIds.has(p.id),
      isOpenNow: computeIsOpenNow(hours),
    })),
  };

  if (!req.user) cacheSet(cacheKey, payload, 10 * 60 * 1000);

  res.json(payload);
}

// ------------------------------------------------------------
// GET /api/places/recommended — "based on your saved places"
// ------------------------------------------------------------
// Signed-in users get places in the same subcategories as their favorites,
// minus the favorites themselves, rated first. Anonymous visitors (or users
// with no favorites yet) get an empty list — the frontend falls back to a
// generic "top picks" row instead of a half-personalized one.

export async function getRecommendedPlaces(req: Request, res: Response) {
  const rawLimit = Math.floor(Number(req.query.limit));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 8)
    : 4;

  if (!req.user) {
    res.json({ items: [] });
    return;
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user.userId },
    select: {
      placeId: true,
      place: { select: { subcategoryId: true } },
    },
  });
  if (favorites.length === 0) {
    res.json({ items: [] });
    return;
  }

  const favoritedIds = favorites.map((f) => f.placeId);
  const subcategoryIds = [
    ...new Set(favorites.map((f) => f.place.subcategoryId)),
  ];

  const items = await prisma.place.findMany({
    where: {
      isActive: true,
      verificationStatus: { not: "SUSPENDED" },
      moderationStatus: "APPROVED",
      id: { notIn: favoritedIds },
      subcategoryId: { in: subcategoryIds },
    },
    take: limit,
    orderBy: [{ ratingAvg: "desc" }, { favoriteCount: "desc" }],
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
      hours: true,
    },
  });

  res.json({
    items: items.map(({ hours, ...place }) => ({
      ...place,
      // Recommended places are by definition not among the user's favorites.
      isFavorited: false,
      isOpenNow: computeIsOpenNow(hours),
    })),
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

const createPlaceBaseSchema = z.object({
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
});

const createPlaceSchema = createPlaceBaseSchema.refine((data) => data.priceMax >= data.priceMin, {
  message: "priceMax must be greater than or equal to priceMin",
  path: ["priceMax"],
});

export async function createPlace(req: Request, res: Response) {
  // console.log("Raw req.body.images:", req.body.images);
  const data = createPlaceSchema.parse(req.body);
  // console.log("Parsed images:", data.images);
  const { images, menuItems, hours, ...placeFields } = data;

  const place = await prisma.place.create({
    data: {
      ...placeFields,
      ownerId: req.user!.userId,
      // New submissions enter the moderation queue. They become publicly
      // visible only after an admin approves them.
      moderationStatus: "PENDING",
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

  // A new listing can shift "similar place" recommendations for its category.
  invalidatePlaceCaches();
  res.status(201).json(place);
}

const updatePlaceSchema = createPlaceBaseSchema.partial();

// Strict on purpose: an owner sending a high-risk key (name, slug, phone,
// location, category) gets a validation error that names the offending key,
// instead of the key being silently dropped by zod's default
// strip-unknown-keys behavior. High-risk proposals must go through the
// review queue instead (POST /places/:slug/edit-requests).
const lowRiskUpdateSchema = z
  .object({
    description: z.string().trim().min(10).max(2000),
    priceMin: z.number().int().min(0),
    priceMax: z.number().int().min(0),
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
  .partial()
  .strict()
  .refine(
    (data) =>
      data.priceMin === undefined ||
      data.priceMax === undefined ||
      data.priceMax >= data.priceMin,
    {
      message: "priceMax must be greater than or equal to priceMin",
      path: ["priceMax"],
    },
  );

// Shared write path for both direct owner/admin edits and admin-approved
// edit requests: replaces images/menu/hours wholesale (existing convention)
// and updates scalar fields. Returns the refreshed place.
export async function applyPlaceChanges(
  placeId: string,
  changes: {
    placeFields: Record<string, unknown>;
    images?: Array<{ url: string; altText?: string }>;
    menuItems?: Array<{ name: string; price: number; note?: string }>;
    hours?: Array<{
      dayOfWeek: DayOfWeek;
      openTime?: string;
      closeTime?: string;
      isClosed: boolean;
    }>;
  },
) {
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (Object.keys(changes.placeFields).length > 0) {
    ops.push(
      prisma.place.update({
        where: { id: placeId },
        data: changes.placeFields,
      }) as Prisma.PrismaPromise<unknown>,
    );
  }

  if (changes.images) {
    ops.push(prisma.placeImage.deleteMany({ where: { placeId } }));
    for (let i = 0; i < changes.images.length; i++) {
      const img = changes.images[i];
      ops.push(
        prisma.placeImage.create({
          data: {
            placeId,
            url: img.url,
            altText: img.altText ?? "",
            isCover: i === 0,
            sortOrder: i,
          },
        }) as Prisma.PrismaPromise<unknown>,
      );
    }
  }

  if (changes.menuItems) {
    ops.push(prisma.menuItem.deleteMany({ where: { placeId } }));
    for (let i = 0; i < changes.menuItems.length; i++) {
      const item = changes.menuItems[i];
      ops.push(
        prisma.menuItem.create({
          data: { ...item, placeId, sortOrder: i },
        }) as Prisma.PrismaPromise<unknown>,
      );
    }
  }

  if (changes.hours) {
    ops.push(prisma.businessHour.deleteMany({ where: { placeId } }));
    for (let i = 0; i < changes.hours.length; i++) {
      ops.push(
        prisma.businessHour.create({
          data: { ...changes.hours[i], placeId },
        }) as Prisma.PrismaPromise<unknown>,
      );
    }
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }

  return prisma.place.findUnique({
    where: { id: placeId },
    include: { images: true, menuItems: true, hours: true },
  });
}

export async function updatePlace(req: Request, res: Response) {
  const { slug } = req.params;

  const place = await prisma.place.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!place) throw new AppError("Place not found", 404);

  const isAdmin = req.user!.role === "ADMIN";
  const isOwner = place.ownerId === req.user!.userId;
  if (!isAdmin && !isOwner) {
    throw new AppError("You don't have permission to edit this place", 403);
  }

  // Admins keep the full edit surface (matches the existing admin hygiene
  // workflow); owners get the low-risk allowlist only, enforced server-side.
  const data = isAdmin
    ? updatePlaceSchema.parse(req.body)
    : lowRiskUpdateSchema.parse(req.body);

  const { images, menuItems, hours, ...placeFields } = data as any;

  const updated = await applyPlaceChanges(place.id, {
    placeFields,
    images,
    menuItems,
    hours,
  });

  // Edits invalidate cached recommendations for every place in this category.
  invalidatePlaceCaches();
  res.json(updated);
}

// ------------------------------------------------------------
// GET /api/places/mine  — OWNER/ADMIN: the places they manage
// ------------------------------------------------------------

export async function getMyPlaces(req: Request, res: Response) {
  const places = await prisma.place.findMany({
    where: { ownerId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      verificationStatus: true,
      moderationStatus: true,
      isActive: true,
      landmark: true,
      contactPhone: true,
      subcategory: { select: { name: true, slug: true } },
      images: { where: { isCover: true }, take: 1 },
      claims: {
        where: { status: "PENDING" },
        select: { id: true, createdAt: true },
        take: 1,
      },
    },
  });

  res.json({ items: places });
}

// ------------------------------------------------------------
// POST /api/places/:slug/claim  — request ownership of an unowned place
// ------------------------------------------------------------

const claimPlaceSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export async function claimPlace(req: Request, res: Response) {
  const { slug } = req.params;
  const { note } = claimPlaceSchema.parse(req.body ?? {});

  const place = await prisma.place.findUnique({
    where: { slug },
    select: {
      id: true,
      ownerId: true,
      isActive: true,
      verificationStatus: true,
      moderationStatus: true,
    },
  });

  // Only listings that are publicly visible can be claimed.
  if (
    !place ||
    !place.isActive ||
    place.verificationStatus === "SUSPENDED" ||
    place.moderationStatus !== "APPROVED"
  ) {
    throw new AppError("Place not found", 404);
  }

  if (place.ownerId) {
    throw new AppError("This place already has an owner", 409);
  }

  const duplicate = await prisma.placeClaim.findUnique({
    where: {
      placeId_userId_status: {
        placeId: place.id,
        userId: req.user!.userId,
        status: "PENDING",
      },
    },
  });
  if (duplicate) {
    throw new AppError("You already have a pending claim for this place", 409);
  }

  const claim = await prisma.placeClaim.create({
    data: {
      placeId: place.id,
      userId: req.user!.userId,
      note: note ?? null,
    },
  });

  res.status(201).json(claim);
}

// ------------------------------------------------------------
// POST /api/places/:slug/edit-requests — propose high-risk changes
// ------------------------------------------------------------

const createEditRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(140)
      .regex(
        /^[a-z0-9-]+$/,
        "slug must be lowercase letters, numbers, and hyphens only",
      )
      .optional(),
    subcategoryId: z.string().cuid().optional(),
    contactPhone: z.string().trim().min(7).max(20).optional(),
    contactPhone2: z.string().trim().min(7).max(20).nullable().optional(),
    landmark: z.string().trim().min(2).max(160).optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => {
    const hasChange =
      data.name ||
      data.slug ||
      data.subcategoryId ||
      data.contactPhone ||
      data.contactPhone2 !== undefined ||
      data.landmark ||
      data.latitude !== undefined ||
      data.longitude !== undefined;
    return hasChange;
  }, {
    message: "Provide at least one field to change",
    path: [],
  });

export async function createPlaceEditRequest(req: Request, res: Response) {
  const { slug } = req.params;
  const parsed = createEditRequestSchema.parse(req.body);
  const { note, ...fields } = parsed;

  const place = await prisma.place.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, isActive: true },
  });
  if (!place || !place.isActive) throw new AppError("Place not found", 404);

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && place.ownerId !== req.user!.userId) {
    throw new AppError("You must own this place to request changes", 403);
  }

  // Build a clean JSON payload — drop undefined keys so the stored object
  // only contains the values that are actually changing.
  const payload: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      payload[key] = value as Prisma.InputJsonValue;
    }
  }

  const editRequest = await prisma.placeEditRequest.create({
    data: {
      placeId: place.id,
      requesterId: req.user!.userId,
      data: payload,
      // The requester's optional note for the reviewer. (reviewNote is a
      // single note slot on the request; only the requester writes it — the
      // admin UI never fills it in.)
      reviewNote: note ?? null,
    },
    include: { place: { select: { name: true, slug: true } } },
  });

  res.status(201).json(editRequest);
}
