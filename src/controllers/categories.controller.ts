import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listCategories(_req: Request, res: Response) {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { places: { where: { isActive: true } } } } },
  });

  res.json({
    items: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      placeCount: c._count.places,
    })),
  });
}
