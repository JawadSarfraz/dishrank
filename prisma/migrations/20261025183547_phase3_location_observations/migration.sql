-- AlterEnum
ALTER TYPE "LocationSource" ADD VALUE 'PANEL_GPS';

-- AlterEnum
ALTER TYPE "ReviewItemType" ADD VALUE 'LOCATION_SUGGESTION';

-- CreateTable
CREATE TABLE "LocationObservation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationObservation_restaurantId_createdAt_idx" ON "LocationObservation"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "LocationObservation" ADD CONSTRAINT "LocationObservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationObservation" ADD CONSTRAINT "LocationObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

