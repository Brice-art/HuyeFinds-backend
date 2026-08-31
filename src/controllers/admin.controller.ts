import { Request, Response } from "express";
import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

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
    usersCreatedLast30Days,
    usersCreatedPrevious30Days,
    usersCreatedLast7Days,
    usersCreatedPreviousWeek,
    recentUsers,
    pendingItems,
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
        isActive: true,
      },
    }),

    prisma.hubPost.count({
      where: {
        isActive: false,
      },
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
        isActive: false,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      include: {
        author: {
          select: {
            name: true,
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
        isActive: true,
      },
      take: 20,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            name: true,
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
  });
}

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
        isActive: true,
      },
      select: {
        id: true,
        isActive: true,
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
    await prisma.hubPost.delete({
      where: {
        id,
      },
    });

    res.status(200).json({
      success: true,
      message: "Post rejected and deleted successfully",
      id,
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
