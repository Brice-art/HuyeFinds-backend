-- AlterEnum
ALTER TYPE "HubPostType" ADD VALUE 'BUY_SELL';

-- AlterTable
ALTER TABLE "HubPost" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isUrgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price" INTEGER,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "HubPostImage" (
    "id" TEXT NOT NULL,
    "hubPostId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HubPostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubPostLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hubPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubPostSave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hubPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubPostSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubPostComment" (
    "id" TEXT NOT NULL,
    "hubPostId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubPostImage_hubPostId_idx" ON "HubPostImage"("hubPostId");

-- CreateIndex
CREATE INDEX "HubPostLike_hubPostId_idx" ON "HubPostLike"("hubPostId");

-- CreateIndex
CREATE UNIQUE INDEX "HubPostLike_userId_hubPostId_key" ON "HubPostLike"("userId", "hubPostId");

-- CreateIndex
CREATE INDEX "HubPostSave_hubPostId_idx" ON "HubPostSave"("hubPostId");

-- CreateIndex
CREATE UNIQUE INDEX "HubPostSave_userId_hubPostId_key" ON "HubPostSave"("userId", "hubPostId");

-- CreateIndex
CREATE INDEX "HubPostComment_hubPostId_idx" ON "HubPostComment"("hubPostId");

-- CreateIndex
CREATE INDEX "HubPost_isPinned_idx" ON "HubPost"("isPinned");

-- AddForeignKey
ALTER TABLE "HubPostImage" ADD CONSTRAINT "HubPostImage_hubPostId_fkey" FOREIGN KEY ("hubPostId") REFERENCES "HubPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPostLike" ADD CONSTRAINT "HubPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPostLike" ADD CONSTRAINT "HubPostLike_hubPostId_fkey" FOREIGN KEY ("hubPostId") REFERENCES "HubPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPostSave" ADD CONSTRAINT "HubPostSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPostSave" ADD CONSTRAINT "HubPostSave_hubPostId_fkey" FOREIGN KEY ("hubPostId") REFERENCES "HubPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPostComment" ADD CONSTRAINT "HubPostComment_hubPostId_fkey" FOREIGN KEY ("hubPostId") REFERENCES "HubPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPostComment" ADD CONSTRAINT "HubPostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
