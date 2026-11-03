-- CreateEnum
CREATE TYPE "MenuItemStatus" AS ENUM ('MATCHED', 'NEEDS_REVIEW', 'IGNORED');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "reviewItemId" TEXT,
ADD COLUMN     "status" "MenuItemStatus" NOT NULL DEFAULT 'NEEDS_REVIEW';

-- CreateTable
CREATE TABLE "MenuParse" (
    "id" TEXT NOT NULL,
    "menuUploadId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "matchCalls" INTEGER NOT NULL DEFAULT 0,
    "matchInputTokens" INTEGER NOT NULL DEFAULT 0,
    "matchOutputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuParse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuParse_startedAt_idx" ON "MenuParse"("startedAt");

-- CreateIndex
CREATE INDEX "MenuParse_menuUploadId_startedAt_idx" ON "MenuParse"("menuUploadId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuUpload_filePath_key" ON "MenuUpload"("filePath");

-- CreateIndex
CREATE INDEX "MenuUpload_status_createdAt_idx" ON "MenuUpload"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_reviewItemId_key" ON "MenuItem"("reviewItemId");

-- CreateIndex
CREATE INDEX "MenuItem_menuUploadId_idx" ON "MenuItem"("menuUploadId");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "ReviewItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuParse" ADD CONSTRAINT "MenuParse_menuUploadId_fkey" FOREIGN KEY ("menuUploadId") REFERENCES "MenuUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

