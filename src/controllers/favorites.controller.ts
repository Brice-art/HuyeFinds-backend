import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const placeIdSchema = z.object({ placeId: z.string().cuid() });

export async function listMyFavorites(req: Request, res: Response) {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    include: {
      place: {
        include: { category: { select: { name: true, slug: true } }, images: { where: { isCover: true }, take: 1 } },
      },
    },
  });

  res.json({ items: favorites.map((f) => ({ ...f.place, isFavorited: true })) });
}

// One endpoint, toggles either way — simpler client code than separate
// add/remove endpoints, and avoids the client having to track state to
// know which one to call.
export async function toggleFavorite(req: Request, res: Response) {
  const { placeId } = placeIdSchema.parse(req.body);
  const userId = req.user!.userId;

  const place = await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } });
  if (!place) throw new AppError("Place not found", 404);

  const existing = await prisma.favorite.findUnique({
    where: { userId_placeId: { userId, placeId } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.favorite.delete({ where: { id: existing.id } }),
      prisma.place.update({ where: { id: placeId }, data: { favoriteCount: { decrement: 1 } } }),
    ]);
    return res.json({ favorited: false });
  }

  await prisma.$transaction([
    prisma.favorite.create({ data: { userId, placeId } }),
    prisma.place.update({ where: { id: placeId }, data: { favoriteCount: { increment: 1 } } }),
  ]);
  return res.json({ favorited: true });
}
