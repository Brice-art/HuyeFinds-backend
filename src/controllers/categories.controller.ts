import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listCategories(_req: Request, res: Response) {
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

  res.json({
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
  });
}
