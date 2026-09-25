-- Place moderation workflow
--
-- Newly submitted places must be reviewed by an admin before they become
-- publicly visible. Existing places are backfilled to APPROVED so nothing
-- already public disappears, and the column's default is flipped to PENDING
-- for future rows (new submissions).

-- CreateEnum
CREATE TYPE "PlaceModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Place" ADD COLUMN "moderationStatus" "PlaceModerationStatus" NOT NULL DEFAULT 'APPROVED';

ALTER TABLE "Place" ALTER COLUMN "moderationStatus" SET DEFAULT 'PENDING';