import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { applyPlaceChanges } from "./places.controller";
import { invalidatePlaceCaches } from "../lib/cache";

const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

const placeVerificationEnum = z.enum([
  "UNVERIFIED",
  "CLAIMED",
  "VERIFIED",
  "SUSPENDED",
]);

const placeModerationEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export async function getAdminOverview(
  _req: Request,
  res: Response,
): Promise<void> {
  const now = new Date();

  const last30DaysStart = new Date(now.getTime() - THIRTY_DAYS_IN_MS);

  const previous30DaysStart = new Date(
    last30DaysStart.getTime() - THIRTY_DAYS_IN_MS,
  );

  const last7DaysStart = new Date(now.getTime() - SEVEN_DAYS_IN_MS);
  const previous7DaysStart = new Date(
    last7DaysStart.getTime() - SEVEN_DAYS_IN_MS,
  );

  const [
    totalUsers,
    totalPlaces,
    totalHubPosts,
    activeHubPosts,
    pendingHubPosts,
    pendingClaims,
    openReports,
    pendingEditRequests,
    pendingPlaces,
    verificationGroups,
    usersCreatedLast30Days,
    usersCreatedPrevious30Days,
    usersCreatedLast7Days,
    usersCreatedPreviousWeek,
    recentUsers,
    pendingItems,
    approvedHubPostsList,
    placeCandidates,
    hubPostCandidates,
  ] = await Promise.all([
    prisma.user.count({
      where: {
        role: { not: "ADMIN" },
      },
    }),

    prisma.place.count({
      where: {
        isActive: true,
      },
    }),

    prisma.hubPost.count(),

    prisma.hubPost.count({
      where: {
        status: "APPROVED",
      },
    }),

    prisma.hubPost.count({
      where: {
        status: "PENDING",
      },
    }),

    prisma.placeClaim.count({
      where: {
        status: "PENDING",
      },
    }),

    prisma.report.count({
      where: {
        status: "OPEN",
      },
    }),

    prisma.placeEditRequest.count({
      where: {
        status: "PENDING",
      },
    }),

    prisma.place.count({
      where: {
        moderationStatus: "PENDING",
      },
    }),

    prisma.place.groupBy({
      by: ["verificationStatus"],
      _count: true,
    }),

    prisma.user.count({
      where: {
        role: { not: "ADMIN" },
        createdAt: {
          gte: last30DaysStart,
        },
      },
    }),

    prisma.user.count({
      where: {
        role: { not: "ADMIN" },
        createdAt: {
          gte: previous30DaysStart,
          lt: last30DaysStart,
        },
      },
    }),

    prisma.user.count({
      where: {
        role: { not: "ADMIN" },
        createdAt: {
          gte: last7DaysStart,
        },
      },
    }),

    prisma.user.count({
      where: {
        role: { not: "ADMIN" },
        createdAt: {
          gte: previous7DaysStart,
          lt: last7DaysStart,
        },
      },
    }),

    prisma.user.findMany({
      where: {
        role: { not: "ADMIN" },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 7,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),

    prisma.hubPost.findMany({
      where: {
        status: "PENDING",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      include: {
        author: {
          select: {
            name: true,
            role: true,
          },
        },
        images: {
          where: {
            isCover: true,
          },
          take: 1,
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    }),

    prisma.hubPost.findMany({
      where: {
        status: "APPROVED",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      include: {
        author: {
          select: {
            name: true,
            role: true,
          },
        },
        images: {
          where: {
            isCover: true,
          },
          take: 1,
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    }),

    prisma.place.findMany({
      where: {
        isActive: true,
      },
      take: 20,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        subcategory: {
          include: {
            category: {
              select: {
                name: true,
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
    }),

    prisma.hubPost.findMany({
      where: {
        status: "APPROVED",
      },
      take: 20,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            name: true,
            role: true,
          },
        },
        images: {
          where: {
            isCover: true,
          },
          take: 1,
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    }),
  ]);

  function calculateGrowthPercent(
    current: number,
    previous: number,
  ): number | null {
    if (previous === 0) {
      return current > 0 ? null : 0; // null = "undefined growth", not zero
    }
    return Math.round(((current - previous) / previous) * 100);
  }

  const userGrowthPercent = calculateGrowthPercent(
    usersCreatedLast30Days,
    usersCreatedPrevious30Days,
  );

  const userWeeklyGrowthPercent = calculateGrowthPercent(
    usersCreatedLast7Days,
    usersCreatedPreviousWeek,
  );

  const topCategorySummary = Object.entries(
    placeCandidates.reduce<Record<string, number>>((accumulator, place) => {
      const categoryName = place.subcategory.category.name;
      accumulator[categoryName] = (accumulator[categoryName] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const topPlaces = [...placeCandidates]
    .sort((first, second) => {
      const secondScore = second.favoriteCount + second.reviewCount;
      const firstScore = first.favoriteCount + first.reviewCount;
      return secondScore - firstScore;
    })
    .slice(0, 5)
    .map((place) => ({
      id: place.id,
      name: place.name,
      category: place.subcategory.category.name,
      favoriteCount: place.favoriteCount,
      reviewCount: place.reviewCount,
    }));

  const mostLikedHubPosts = [...hubPostCandidates]
    .sort((first, second) => second._count.likes - first._count.likes)
    .slice(0, 5)
    .map((post) => ({
      id: post.id,
      title: post.title,
      likes: post._count.likes,
      comments: post._count.comments,
      viewCount: post.viewCount,
      authorName: post.author.name,
    }));

  const mostViewedHubPosts = [...hubPostCandidates]
    .sort((first, second) => second.viewCount - first.viewCount)
    .slice(0, 5)
    .map((post) => ({
      id: post.id,
      title: post.title,
      viewCount: post.viewCount,
      likes: post._count.likes,
      comments: post._count.comments,
      authorName: post.author.name,
    }));

  const placesByVerification = Object.fromEntries(
    verificationGroups.map((group) => [group.verificationStatus, group._count]),
  ) as Record<
    "UNVERIFIED" | "CLAIMED" | "VERIFIED" | "SUSPENDED",
    number
  >;

  res.status(200).json({
    stats: {
      totalUsers,
      userGrowthPercent,
      userWeeklyGrowthPercent,
      usersCreatedLast7Days,
      usersCreatedLast30Days,
      totalPlaces,
      totalHubPosts,
      activeHubPosts,
      pendingHubPosts,
      pendingClaims,
      openReports,
      pendingEditRequests,
      pendingPlaces,
      placesByVerification,
    },

    recentUsers: recentUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
    })),

    placeInsights: {
      topCategories: topCategorySummary,
      topPlaces,
    },

    hubPostInsights: {
      mostLiked: mostLikedHubPosts,
      mostViewed: mostViewedHubPosts,
    },

    pendingHubPosts: pendingItems.map((post) => {
      const { _count, ...postData } = post;

      return {
        ...postData,
        likeCount: _count.likes,
        commentCount: _count.comments,
      };
    }),

    approvedHubPosts: approvedHubPostsList.map((post) => {
      const { _count, ...postData } = post;

      return {
        ...postData,
        likeCount: _count.likes,
        commentCount: _count.comments,
      };
    }),
  });
}

// ------------------------------------------------------------
// Student Hub post moderation
// ------------------------------------------------------------

export async function approveHubPost(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  try {
    const updatedPost = await prisma.hubPost.update({
      where: {
        id,
      },
      data: {
        status: "APPROVED",
      },
      select: {
        id: true,
        status: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Post approved successfully",
      post: updatedPost,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AppError("Post not found", 404);
    }

    throw error;
  }
}

export async function rejectHubPost(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  try {
    const updatedPost = await prisma.hubPost.update({
      where: {
        id,
      },
      data: {
        status: "REJECTED",
      },
      select: {
        id: true,
        status: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Post rejected",
      post: updatedPost,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AppError("Post not found", 404);
    }

    throw error;
  }
}

// Take down a previously approved post (e.g. after a report). The row is kept
// for audit — nothing is hard-deleted by moderation actions.
export async function removeHubPost(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  try {
    const updatedPost = await prisma.hubPost.update({
      where: {
        id,
      },
      data: {
        status: "REMOVED",
      },
      select: {
        id: true,
        status: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Post removed from public view",
      post: updatedPost,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AppError("Post not found", 404);
    }

    throw error;
  }
}

// ------------------------------------------------------------
// Place verification status
// ------------------------------------------------------------

const listPlacesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  verification: placeVerificationEnum.optional(),
  moderation: placeModerationEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listAdminPlaces(req: Request, res: Response) {
  const q = listPlacesQuerySchema.parse(req.query);

  const where: Prisma.PlaceWhereInput = {
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: "insensitive" as const } },
            {
              landmark: { contains: q.search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
    ...(q.verification ? { verificationStatus: q.verification } : {}),
    ...(q.moderation ? { moderationStatus: q.moderation } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.place.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { createdAt: "desc" },
      include: {
        subcategory: { select: { name: true, slug: true } },
        owner: { select: { id: true, name: true, email: true, role: true } },
        images: { where: { isCover: true }, take: 1 },
      },
    }),
    prisma.place.count({ where }),
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

const setVerificationSchema = z.object({
  status: placeVerificationEnum,
});

export async function setPlaceVerification(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const { status } = setVerificationSchema.parse(req.body);

  try {
    const place = await prisma.place.update({
      where: { id },
      data: { verificationStatus: status },
      select: {
        id: true,
        name: true,
        verificationStatus: true,
      },
    });

    invalidatePlaceCaches();

    res.json({ success: true, place });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AppError("Place not found", 404);
    }

    throw error;
  }
}

const setModerationSchema = z.object({
  status: placeModerationEnum,
});

export async function setPlaceModeration(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const { status } = setModerationSchema.parse(req.body);

  try {
    const place = await prisma.place.update({
      where: { id },
      data: { moderationStatus: status },
      select: {
        id: true,
        name: true,
        moderationStatus: true,
        isActive: true,
      },
    });

    invalidatePlaceCaches();

    res.json({ success: true, place });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AppError("Place not found", 404);
    }

    throw error;
  }
}

// ------------------------------------------------------------
// Restaurant claims
// ------------------------------------------------------------

export async function listClaims(_req: Request, res: Response) {
  const claims = await prisma.placeClaim.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      place: {
        select: {
          id: true,
          name: true,
          slug: true,
          verificationStatus: true,
          ownerId: true,
        },
      },
      user: {
        select: { id: true, name: true, email: true, phone: true, role: true },
      },
    },
  });

  res.json({ items: claims });
}

export async function approveClaim(req: Request, res: Response) {
  const { id } = req.params;
  const adminId = req.user!.userId;

  const claim = await prisma.placeClaim.findUnique({
    where: { id },
    include: {
      place: { select: { id: true, verificationStatus: true } },
      user: { select: { id: true, role: true } },
    },
  });

  if (!claim) throw new AppError("Claim not found", 404);
  if (claim.status !== "PENDING") {
    throw new AppError("This claim has already been reviewed", 400);
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.placeClaim.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: adminId, reviewedAt: now },
    }),
    prisma.place.update({
      where: { id: claim.placeId },
      data: {
        ownerId: claim.user.id,
        // A claim grants ownership; if the listing had no trust state yet it
        // becomes "claimed". Already-verified listings keep their badge.
        ...(claim.place.verificationStatus === "UNVERIFIED"
          ? { verificationStatus: "CLAIMED" }
          : {}),
      },
    }),
    prisma.user.update({
      where: { id: claim.user.id },
      data: { role: "OWNER" },
    }),
  ]);

  invalidatePlaceCaches();

  res.json({
    success: true,
    message: "Claim approved — ownership granted",
  });
}

export async function rejectClaim(req: Request, res: Response) {
  const { id } = req.params;

  const claim = await prisma.placeClaim.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!claim) throw new AppError("Claim not found", 404);
  if (claim.status !== "PENDING") {
    throw new AppError("This claim has already been reviewed", 400);
  }

  await prisma.placeClaim.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedById: req.user!.userId,
      reviewedAt: new Date(),
    },
  });

  res.json({ success: true, message: "Claim rejected" });
}

// ------------------------------------------------------------
// Reports
// ------------------------------------------------------------

export async function listReports(_req: Request, res: Response) {
  const reports = await prisma.report.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
    },
  });

  // Attach a human-readable label for each target in one shot.
  const postIds = reports
    .filter((r) => r.targetType === "HUB_POST")
    .map((r) => r.targetId);
  const placeIds = reports
    .filter((r) => r.targetType === "PLACE")
    .map((r) => r.targetId);

  const [posts, places] = await Promise.all([
    postIds.length
      ? prisma.hubPost.findMany({
          where: { id: { in: postIds } },
          select: { id: true, title: true, status: true },
        })
      : Promise.resolve([]),
    placeIds.length
      ? prisma.place.findMany({
          where: { id: { in: placeIds } },
          select: { id: true, name: true, slug: true, isActive: true },
        })
      : Promise.resolve([]),
  ]);

  const postMap = new Map(posts.map((p) => [p.id, p]));
  const placeMap = new Map(places.map((p) => [p.id, p]));

  res.json({
    items: reports.map((report) => {
      const postTarget =
        report.targetType === "HUB_POST"
          ? postMap.get(report.targetId)
          : undefined;
      const placeTarget =
        report.targetType === "PLACE"
          ? placeMap.get(report.targetId)
          : undefined;

      return {
        ...report,
        targetTitle:
          report.targetType === "HUB_POST"
            ? postTarget?.title ?? "(deleted post)"
            : placeTarget?.name ?? "(deleted place)",
        targetStatus:
          report.targetType === "HUB_POST"
            ? postTarget?.status ?? "MISSING"
            : placeTarget
              ? placeTarget.isActive
                ? "ACTIVE"
                : "INACTIVE"
              : "MISSING",
      };
    }),
  });
}

export async function resolveReport(req: Request, res: Response) {
  const { id } = req.params;

  const report = await prisma.report.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!report) throw new AppError("Report not found", 404);
  if (report.status !== "OPEN") {
    throw new AppError("This report has already been handled", 400);
  }

  await prisma.report.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedById: req.user!.userId,
      resolvedAt: new Date(),
    },
  });

  res.json({ success: true, message: "Report resolved" });
}

export async function dismissReport(req: Request, res: Response) {
  const { id } = req.params;

  const report = await prisma.report.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!report) throw new AppError("Report not found", 404);
  if (report.status !== "OPEN") {
    throw new AppError("This report has already been handled", 400);
  }

  await prisma.report.update({
    where: { id },
    data: {
      status: "DISMISSED",
      resolvedById: req.user!.userId,
      resolvedAt: new Date(),
    },
  });

  res.json({ success: true, message: "Report dismissed" });
}

// ------------------------------------------------------------
// Place edit requests (high-risk changes proposed by owners)
// ------------------------------------------------------------

export async function listEditRequests(_req: Request, res: Response) {
  const requests = await prisma.placeEditRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      place: { select: { id: true, name: true, slug: true } },
      requester: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  res.json({ items: requests });
}

export async function approveEditRequest(req: Request, res: Response) {
  const { id } = req.params;

  const editRequest = await prisma.placeEditRequest.findUnique({
    where: { id },
  });

  if (!editRequest) throw new AppError("Edit request not found", 404);
  if (editRequest.status !== "PENDING") {
    throw new AppError("This edit request has already been reviewed", 400);
  }

  const data = editRequest.data as Record<string, unknown>;

  const place = await prisma.place.findUnique({
    where: { id: editRequest.placeId },
    select: { id: true, slug: true, subcategoryId: true },
  });
  if (!place) throw new AppError("Place not found", 404);

  // Only the high-risk fields are stored on requests; apply them and refresh
  // the place the same way a direct edit would.
  const placeFields: Record<string, unknown> = {};
  for (const key of [
    "name",
    "slug",
    "subcategoryId",
    "contactPhone",
    "contactPhone2",
    "landmark",
    "latitude",
    "longitude",
  ]) {
    if (data[key] !== undefined) {
      placeFields[key] = data[key];
    }
  }

  await applyPlaceChanges(place.id, { placeFields });

  await prisma.placeEditRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedById: req.user!.userId,
      reviewedAt: new Date(),
    },
  });

  invalidatePlaceCaches();

  res.json({ success: true, message: "Changes applied to the place" });
}

export async function rejectEditRequest(req: Request, res: Response) {
  const { id } = req.params;

  const editRequest = await prisma.placeEditRequest.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!editRequest) throw new AppError("Edit request not found", 404);
  if (editRequest.status !== "PENDING") {
    throw new AppError("This edit request has already been reviewed", 400);
  }

  await prisma.placeEditRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedById: req.user!.userId,
      reviewedAt: new Date(),
    },
  });

  res.json({ success: true, message: "Edit request rejected" });
}