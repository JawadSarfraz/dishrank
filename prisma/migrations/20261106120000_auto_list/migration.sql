-- Auto-list (docs/07 §2a): which restaurants and candidates it created, and which an admin has looked at since.
-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'AUTO_LIST';

-- AlterTable
ALTER TABLE "OvertureCandidate" ADD COLUMN     "autoListedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "autoListedAt" TIMESTAMP(3),
ADD COLUMN     "checkedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Restaurant_autoListedAt_checkedAt_idx" ON "Restaurant"("autoListedAt", "checkedAt");
