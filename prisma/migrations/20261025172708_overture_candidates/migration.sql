-- CreateEnum
CREATE TYPE "RestaurantSource" AS ENUM ('OVERTURE', 'MANUAL');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('OVERTURE', 'ADMIN');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'CREATED', 'LINKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CandidateSkipReason" AS ENUM ('CLOSED', 'DUPLICATE', 'NOT_A_RESTAURANT');

-- AlterTable
-- Restaurants that exist before this migration were entered by an admin (none so far), and any
-- coordinates they still have were typed by an admin (Google ones were cleared by
-- drop_google_places). New rows always set source explicitly, so the default is dropped again.
ALTER TABLE "Restaurant" ADD COLUMN     "locationSource" "LocationSource",
ADD COLUMN     "overtureId" TEXT,
ADD COLUMN     "source" "RestaurantSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "website" TEXT;
ALTER TABLE "Restaurant" ALTER COLUMN "source" DROP DEFAULT;
UPDATE "Restaurant" SET "locationSource" = 'ADMIN' WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL;
UPDATE "Restaurant" SET "lat" = NULL, "lng" = NULL WHERE "lat" IS NULL OR "lng" IS NULL;

-- CreateTable
CREATE TABLE "OvertureCandidate" (
    "id" TEXT NOT NULL,
    "overtureId" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "lastSeenRelease" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "suggestedAreaId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "category" TEXT,
    "alternates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sources" TEXT[],
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "skipReason" "CandidateSkipReason",
    "restaurantId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertureCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OvertureCandidate_overtureId_key" ON "OvertureCandidate"("overtureId");

-- CreateIndex
CREATE INDEX "OvertureCandidate_cityId_status_suggestedAreaId_idx" ON "OvertureCandidate"("cityId", "status", "suggestedAreaId");

-- CreateIndex
CREATE INDEX "OvertureCandidate_restaurantId_idx" ON "OvertureCandidate"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_overtureId_key" ON "Restaurant"("overtureId");

-- AddForeignKey
ALTER TABLE "OvertureCandidate" ADD CONSTRAINT "OvertureCandidate_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertureCandidate" ADD CONSTRAINT "OvertureCandidate_suggestedAreaId_fkey" FOREIGN KEY ("suggestedAreaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertureCandidate" ADD CONSTRAINT "OvertureCandidate_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertureCandidate" ADD CONSTRAINT "OvertureCandidate_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

