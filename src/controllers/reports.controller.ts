import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

// Logged-in users flag content for moderation. Reports don't change the
// target themselves — an admin decides (resolve/dismiss) from the dashboard.

const reportTargetTypeEnum = z.enum(["HUB_POST", "PLACE"]);

const createReportSchema = z.object({
  targetType: reportTargetTypeEnum,
  targetId: z.string().min(1),
  reason: z.string().trim().min(5).max(300),
  details: z.string().trim().max(1000).optional(),
});

export async function createReport(req: Request, res: Response) {
  const data = createReportSchema.parse(req.body);

  // Make sure the reported thing actually exists.
  let targetExists = false;
  if (data.targetType === "HUB_POST") {
    targetExists = !!(await prisma.hubPost.findUnique({
      where: { id: data.targetId },
      select: { id: true },
    }));
  } else {
    targetExists = !!(await prisma.place.findUnique({
      where: { id: data.targetId },
      select: { id: true },
    }));
  }

  if (!targetExists) {
    throw new AppError("The content you're reporting doesn't exist", 404);
  }

  const report = await prisma.report.create({
    data: {
      targetType: data.targetType,
      targetId: data.targetId,
      reporterId: req.user!.userId,
      reason: data.reason,
      details: data.details,
    },
  });

  res.status(201).json(report);
}