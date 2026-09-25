import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { cacheGet, cacheSet } from "../lib/cache";

const CATEGORIES_CACHE_KEY = "categories:list";
const CATEGORIES_TTL_MS = 5 * 60 * 1000;

export async function listCategories(_req: Request, res: Response) {
  // Categories + subcategory counts are read on every page load and only
  // change when an admin edits taxonomy. Serve from the in-memory cache to
  // avoid the same Prisma aggregation on every request.
  const cached = cacheGet<unknown>(CATEGORIES_CACHE_KEY);
  if (cached) {
    res.json(cached);
    return;
  }

  const categories = await prisma.category.findMany({
    orderBy: {
      sortOrder: "asc",
    },
    include: {
      subcategories: {
        include: {
          _count: {
            select: {
              places: {
                where: {
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const payload = {
    items: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      placeCount: c.subcategories.reduce(
        (total, sub) => total + sub._count.places,
        0
      ),
      subcategories: c.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        placeCount: sub._count.places,
      })),
    })),
  };

  cacheSet(CATEGORIES_CACHE_KEY, payload, CATEGORIES_TTL_MS);
  res.json(payload);
}
