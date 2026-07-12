import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const reviewSchema = z.object({
  placeId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

// Recomputes the denormalized aggregate from the Review table directly —
// this is the one place that's allowed to write ratingAvg/reviewCount.
// Never increment/decrement those fields by hand elsewhere; averages
// don't compose with +1/-1 the way counts do.
async function recomputePlaceRating(tx: any, placeId: string) {
  const agg = await tx.review.aggregate({
    where: { placeId },
    _avg: { rating: true },
    _count: true,
  });

  await tx.place.update({
    where: { id: placeId },
    data: {
      ratingAvg: agg._avg.rating ?? 0,
      reviewCount: agg._count,
    },
  });
}

// Create-or-update in one call, matching the @@unique([placeId, userId])
// constraint on Review — a student can only have one review per place,
// so submitting again edits it rather than erroring.
export async function upsertReview(req: Request, res: Response) {
  const data = reviewSchema.parse(req.body);
  const userId = req.user!.userId;

  const place = await prisma.place.findUnique({ where: { id: data.placeId }, select: { id: true } });
  if (!place) throw new AppError("Place not found", 404);

  await prisma.$transaction(async (tx: any) => {
    await tx.review.upsert({
      where: { placeId_userId: { placeId: data.placeId, userId } },
      create: { placeId: data.placeId, userId, rating: data.rating, comment: data.comment },
      update: { rating: data.rating, comment: data.comment },
    });
    await recomputePlaceRating(tx, data.placeId);
  });

  res.status(201).json({ success: true });
}

export async function deleteReview(req: Request, res: Response) {
  const { placeId } = z.object({ placeId: z.string().cuid() }).parse(req.params);
  const userId = req.user!.userId;

  const existing = await prisma.review.findUnique({
    where: { placeId_userId: { placeId, userId } },
  });
  if (!existing) throw new AppError("Review not found", 404);

  await prisma.$transaction(async (tx: any) => {
    await tx.review.delete({ where: { id: existing.id } });
    await recomputePlaceRating(tx, placeId);
  });

  res.json({ success: true });
}
