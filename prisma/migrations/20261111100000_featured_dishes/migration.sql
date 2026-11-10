-- Featured dishes (docs/01 Home, 2026-11-11): one or two dishes a city's home page leads with, and the
-- round they belong to: its name and the day voting for its results closes (end of day, Pakistan).
-- AlterTable
ALTER TABLE "City" ADD COLUMN     "featuredClosesAt" TIMESTAMP(3),
ADD COLUMN     "featuredRound" TEXT;

-- CreateTable
CREATE TABLE "FeaturedDish" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedDish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedDish_cityId_dishId_key" ON "FeaturedDish"("cityId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedDish_cityId_position_key" ON "FeaturedDish"("cityId", "position");

-- AddForeignKey
ALTER TABLE "FeaturedDish" ADD CONSTRAINT "FeaturedDish_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedDish" ADD CONSTRAINT "FeaturedDish_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The first round, the same as seed/cities.json: chicken karahi and mutton karahi in both cities,
-- voting for the winter results closing Sunday 20 December 2026, end of day in Pakistan (18:59:59
-- UTC). Adds only: a city that already has featured dishes or a date keeps them.
INSERT INTO "FeaturedDish" ("id", "cityId", "dishId", "position")
SELECT md5(c."id" || ':' || d."slug"), c."id", d."id",
  CASE d."slug" WHEN 'chicken-karahi' THEN 1 ELSE 2 END
FROM "City" c
CROSS JOIN "Dish" d
WHERE d."slug" IN ('chicken-karahi', 'mutton-karahi')
  AND NOT EXISTS (SELECT 1 FROM "FeaturedDish" f WHERE f."cityId" = c."id")
ON CONFLICT DO NOTHING;

UPDATE "City"
SET "featuredClosesAt" = '2026-12-20 18:59:59', "featuredRound" = 'winter results'
WHERE "featuredClosesAt" IS NULL AND "featuredRound" IS NULL;
