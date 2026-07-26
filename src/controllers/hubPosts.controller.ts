import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const hubPostTypeEnum = z.enum([
  "SIDE_HUSTLE",
  "LOST_FOUND",
  "EVENT",
  "ANNOUNCEMENT",
]);

const listQuerySchema = z.object({
  type: hubPostTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function listHubPosts(req: Request, res: Response) {
  const q = listQuerySchema.parse(req.query);

  const where = {
    isActive: true,
    ...(q.type ? { type: q.type } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.hubPost.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    }),
    prisma.hubPost.count({ where }),
  ]);

  res.json({
    items,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  });
}

const createHubPostSchema = z.object({
  type: hubPostTypeEnum,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  contactPhone: z.string().trim().min(7).max(20).optional(),
  location: z.string().trim().max(160).optional(),
  eventDate: z.coerce.date().optional(),
});

export async function createHubPost(req: Request, res: Response) {
  const data = createHubPostSchema.parse(req.body);

  const post = await prisma.hubPost.create({
    data: { ...data, authorId: req.user!.userId },
    include: { author: { select: { name: true } } },
  });

  res.status(201).json(post);
}

export async function deleteHubPost(req: Request, res: Response) {
  const { id } = req.params;

  const post = await prisma.hubPost.findUnique({
    where: { id },
    select: { authorId: true },
  });
  if (!post) throw new AppError("Post not found", 404);

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && post.authorId !== req.user!.userId) {
    throw new AppError("You don't have permission to delete this post", 403);
  }

  await prisma.hubPost.delete({ where: { id } });
  res.json({ success: true });
}
