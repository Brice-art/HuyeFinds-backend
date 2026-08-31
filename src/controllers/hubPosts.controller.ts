import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const hubPostTypeEnum = z.enum([
  "SIDE_HUSTLE",
  "BUY_SELL",
  "LOST_FOUND",
  "EVENT",
  "ANNOUNCEMENT",
]);

const listQuerySchema = z.object({
  type: hubPostTypeEnum.optional(),
  search: z.string().trim().max(120).optional(),
  pinned: z.coerce.boolean().optional(),
  sort: z.enum(["newest", "mostLiked", "mostViewed"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const ORDER_BY = {
  newest: [{ createdAt: "desc" as const }],
  mostLiked: [{ likes: { _count: "desc" as const } }],
  mostViewed: [{ viewCount: "desc" as const }],
};

export async function listHubPosts(req: Request, res: Response) {
  const q = listQuerySchema.parse(req.query);

  const where = {
    isActive: true,
    ...(q.pinned !== undefined ? { isPinned: q.pinned } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.search
      ? {
          OR: [
            { title: { contains: q.search, mode: "insensitive" as const } },
            {
              description: { contains: q.search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.hubPost.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: ORDER_BY[q.sort],
      include: {
        author: { select: { name: true } },
        images: { where: { isCover: true }, take: 1 },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.hubPost.count({ where }),
  ]);

  let likedIds = new Set<string>();
  let savedIds = new Set<string>();
  if (req.user) {
    const [likes, saves] = await Promise.all([
      prisma.hubPostLike.findMany({
        where: {
          userId: req.user.userId,
          hubPostId: { in: items.map((p) => p.id) },
        },
        select: { hubPostId: true },
      }),
      prisma.hubPostSave.findMany({
        where: {
          userId: req.user.userId,
          hubPostId: { in: items.map((p) => p.id) },
        },
        select: { hubPostId: true },
      }),
    ]);
    likedIds = new Set(likes.map((l) => l.hubPostId));
    savedIds = new Set(saves.map((s) => s.hubPostId));
  }

  const itemsWithMeta = items.map(({ _count, ...post }) => ({
    ...post,
    likeCount: _count.likes,
    commentCount: _count.comments,
    isLiked: likedIds.has(post.id),
    isSaved: savedIds.has(post.id),
  }));

  res.json({
    items: itemsWithMeta,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  });
}

export async function getHubPostStats(_req: Request, res: Response) {
  const counts = await prisma.hubPost.groupBy({
    by: ["type"],
    where: { isActive: true },
    _count: true,
  });

  const total = await prisma.hubPost.count({ where: { isActive: true } });

  const byType: Record<string, number> = {};
  counts.forEach((c) => {
    byType[c.type] = c._count;
  });

  res.json({ total, byType });
}

export async function getHubPostById(req: Request, res: Response) {
  const { id } = req.params;

  const post = await prisma.hubPost
    .update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      include: {
        author: { select: { name: true } },
        images: { orderBy: { sortOrder: "asc" } },
        _count: { select: { likes: true, comments: true } },
      },
    })
    .catch(() => null);

  if (!post || !post.isActive) {
    throw new AppError("Post not found", 404);
  }

  let isLiked = false;
  let isSaved = false;
  if (req.user) {
    const [like, save] = await Promise.all([
      prisma.hubPostLike.findUnique({
        where: { userId_hubPostId: { userId: req.user.userId, hubPostId: id } },
      }),
      prisma.hubPostSave.findUnique({
        where: { userId_hubPostId: { userId: req.user.userId, hubPostId: id } },
      }),
    ]);
    isLiked = !!like;
    isSaved = !!save;
  }

  const { _count, ...rest } = post;
  res.json({
    ...rest,
    likeCount: _count.likes,
    commentCount: _count.comments,
    isLiked,
    isSaved,
  });
}

const createHubPostSchema = z.object({
  type: hubPostTypeEnum,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  price: z.number().int().min(0).optional(),
  isUrgent: z.boolean().optional().default(false),
  contactPhone: z.string().trim().min(7).max(20).optional(),
  location: z.string().trim().max(160).optional(),
  eventDate: z.coerce.date().optional(),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        altText: z.string().trim().max(200).optional(),
      }),
    )
    .max(6)
    .optional(),
});

export async function createHubPost(req: Request, res: Response) {
  const data = createHubPostSchema.parse(req.body);
  const { images, ...fields } = data;

  const post = await prisma.hubPost.create({
    data: {
      ...fields,
      isActive: req.user!.role === "ADMIN",
      authorId: req.user!.userId,
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
    },
    include: { author: { select: { name: true } }, images: true },
  });

  res
    .status(201)
    .json({
      ...post,
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
      isSaved: false,
    });
}

const updateHubPostSchema = createHubPostSchema.partial();

export async function updateHubPost(req: Request, res: Response) {
  const { id } = req.params;
  const data = updateHubPostSchema.parse(req.body);

  const post = await prisma.hubPost.findUnique({ where: { id }, select: { authorId: true } });
  if (!post) throw new AppError("Post not found", 404);

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && post.authorId !== req.user!.userId) {
    throw new AppError("You don't have permission to edit this post", 403);
  }

  const { images, ...fields } = data as any;

  // Update main fields first
  await prisma.hubPost.update({ where: { id }, data: fields });

  if (images) {
    // replace images
    await prisma.hubPostImage.deleteMany({ where: { hubPostId: id } });
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      await prisma.hubPostImage.create({
        data: {
          hubPostId: id,
          url: img.url,
          altText: img.altText ?? "",
          isCover: i === 0,
          sortOrder: i,
        },
      });
    }
  }

  const updated = await prisma.hubPost.findUnique({
    where: { id },
    include: { author: { select: { name: true } }, images: true, _count: { select: { likes: true, comments: true } } },
  });

  const { _count, ...rest } = updated!;
  res.json({
    ...rest,
    likeCount: _count.likes,
    commentCount: _count.comments,
  });
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

export async function toggleHubPostPin(req: Request, res: Response) {
  const { id } = req.params;

  const post = await prisma.hubPost.findUnique({
    where: { id },
    select: { isPinned: true },
  });
  if (!post) throw new AppError("Post not found", 404);

  const updated = await prisma.hubPost.update({
    where: { id },
    data: { isPinned: !post.isPinned },
  });
  res.json({ isPinned: updated.isPinned });
}

export async function toggleHubPostLike(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user!.userId;

  const post = await prisma.hubPost.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) throw new AppError("Post not found", 404);

  const existing = await prisma.hubPostLike.findUnique({
    where: { userId_hubPostId: { userId, hubPostId: id } },
  });

  if (existing) {
    await prisma.hubPostLike.delete({ where: { id: existing.id } });
    return res.json({ liked: false });
  }

  await prisma.hubPostLike.create({ data: { userId, hubPostId: id } });
  return res.json({ liked: true });
}

export async function toggleHubPostSave(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user!.userId;

  const post = await prisma.hubPost.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) throw new AppError("Post not found", 404);

  const existing = await prisma.hubPostSave.findUnique({
    where: { userId_hubPostId: { userId, hubPostId: id } },
  });

  if (existing) {
    await prisma.hubPostSave.delete({ where: { id: existing.id } });
    return res.json({ saved: false });
  }

  await prisma.hubPostSave.create({ data: { userId, hubPostId: id } });
  return res.json({ saved: true });
}

export async function listHubPostComments(req: Request, res: Response) {
  const { id } = req.params;

  const comments = await prisma.hubPostComment.findMany({
    where: { hubPostId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true } } },
  });

  res.json({ items: comments });
}

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

export async function createHubPostComment(req: Request, res: Response) {
  const { id } = req.params;
  const { body } = createCommentSchema.parse(req.body);

  const post = await prisma.hubPost.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) throw new AppError("Post not found", 404);

  const comment = await prisma.hubPostComment.create({
    data: { hubPostId: id, authorId: req.user!.userId, body },
    include: { author: { select: { name: true } } },
  });

  res.status(201).json(comment);
}
