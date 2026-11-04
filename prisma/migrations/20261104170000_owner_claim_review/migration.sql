-- AlterTable
ALTER TABLE "OwnerClaim" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "reviewedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "OwnerClaim_userId_restaurantId_idx" ON "OwnerClaim"("userId", "restaurantId");

-- AddForeignKey
ALTER TABLE "OwnerClaim" ADD CONSTRAINT "OwnerClaim_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

