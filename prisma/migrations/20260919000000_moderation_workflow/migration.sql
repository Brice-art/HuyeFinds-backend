-- CreateEnum
CREATE TYPE "HubPostStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PlaceVerificationStatus" AS ENUM ('UNVERIFIED', 'CLAIMED', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('HUB_POST', 'PLACE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
-- HubPost: replace the pending/approved boolean with an explicit moderation
-- lifecycle. Existing rows are preserved: previously-approved posts keep a
-- public status, everything else is treated as pending (the old "reject"
-- action hard-deleted rows, so no historical "rejected" rows can exist).
ALTER TABLE "HubPost" ADD COLUMN "status" "HubPostStatus" NOT NULL DEFAULT 'PENDING';
UPDATE "HubPost" SET "status" = 'APPROVED' WHERE "isActive" = true;
ALTER TABLE "HubPost" DROP COLUMN "isActive";

-- AlterTable
-- Existing places stay UNVERIFIED until they are claimed/verified — no data loss.
ALTER TABLE "Place" ADD COLUMN "verificationStatus" "PlaceVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- CreateIndex
CREATE INDEX "HubPost_status_idx" ON "HubPost"("status");

-- CreateTable
CREATE TABLE "PlaceClaim" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceEditRequest" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceEditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaceClaim_placeId_userId_status_key" ON "PlaceClaim"("placeId", "userId", "status");

-- CreateIndex
CREATE INDEX "PlaceClaim_status_idx" ON "PlaceClaim"("status");

-- CreateIndex
CREATE INDEX "PlaceClaim_placeId_idx" ON "PlaceClaim"("placeId");

-- CreateIndex
CREATE INDEX "PlaceEditRequest_status_idx" ON "PlaceEditRequest"("status");

-- CreateIndex
CREATE INDEX "PlaceEditRequest_placeId_idx" ON "PlaceEditRequest"("placeId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- AddForeignKey
ALTER TABLE "PlaceClaim" ADD CONSTRAINT "PlaceClaim_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceClaim" ADD CONSTRAINT "PlaceClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceClaim" ADD CONSTRAINT "PlaceClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceEditRequest" ADD CONSTRAINT "PlaceEditRequest_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceEditRequest" ADD CONSTRAINT "PlaceEditRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceEditRequest" ADD CONSTRAINT "PlaceEditRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;