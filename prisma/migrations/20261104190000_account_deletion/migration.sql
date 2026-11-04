-- DropForeignKey
ALTER TABLE "MenuUpload" DROP CONSTRAINT "MenuUpload_uploadedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Flag" DROP CONSTRAINT "Flag_userId_fkey";

-- DropForeignKey
ALTER TABLE "OwnerClaim" DROP CONSTRAINT "OwnerClaim_userId_fkey";

-- AlterTable
ALTER TABLE "MenuUpload" ALTER COLUMN "uploadedByUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MenuUpload" ADD CONSTRAINT "MenuUpload_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerClaim" ADD CONSTRAINT "OwnerClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

