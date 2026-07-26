-- CreateEnum
CREATE TYPE "HubPostType" AS ENUM ('SIDE_HUSTLE', 'LOST_FOUND', 'EVENT', 'ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "HubPost" (
    "id" TEXT NOT NULL,
    "type" "HubPostType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contactPhone" TEXT,
    "location" TEXT,
    "eventDate" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubPost_type_idx" ON "HubPost"("type");

-- CreateIndex
CREATE INDEX "HubPost_authorId_idx" ON "HubPost"("authorId");

-- AddForeignKey
ALTER TABLE "HubPost" ADD CONSTRAINT "HubPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
