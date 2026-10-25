-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('ACTIVE', 'CLOSED', 'DUPLICATE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "RestaurantDishStatus" AS ENUM ('CANDIDATE', 'USER_CONFIRMED', 'MENU_VERIFIED', 'OWNER_VERIFIED', 'STALE', 'REMOVED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('PANEL', 'USER', 'OWNER', 'MENU_PHOTO', 'GOOGLE_SEARCH', 'ADMIN');

-- CreateEnum
CREATE TYPE "RatingStatus" AS ENUM ('ACTIVE', 'HELD', 'HIDDEN');

-- CreateEnum
CREATE TYPE "MenuUploadStatus" AS ENUM ('PENDING', 'PARSED', 'FAILED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('ALIAS', 'TRIGRAM', 'LLM', 'HUMAN', 'NONE');

-- CreateEnum
CREATE TYPE "ReviewItemType" AS ENUM ('UNMATCHED_MENU_ITEM', 'DISH_PROPOSAL', 'RESTAURANT_PROPOSAL', 'FLAG', 'SUSPICIOUS_RATINGS', 'OWNER_CLAIM', 'DUPLICATE_RESTAURANT', 'PLACE_REFRESH_FAILED');

-- CreateEnum
CREATE TYPE "ReviewItemStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FlagReason" AS ENUM ('NOT_SERVED', 'WRONG_DISH', 'RESTAURANT_CLOSED', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "launchedAt" TIMESTAMP(3),

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "areaId" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "priceBand" INTEGER,
    "googlePlaceId" TEXT,
    "googleSyncedAt" TIMESTAMP(3),
    "status" "RestaurantStatus" NOT NULL DEFAULT 'ACTIVE',
    "searchText" TEXT NOT NULL DEFAULT '',
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DishCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT,
    "isLaunch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishAlias" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DishAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantDish" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "menuName" TEXT,
    "price" INTEGER,
    "variantTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RestaurantDishStatus" NOT NULL DEFAULT 'CANDIDATE',
    "source" "SourceType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "distinctRaters" INTEGER NOT NULL DEFAULT 0,
    "weightSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightedScoreSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rawMean" DECIMAL(5,3),
    "score" DECIMAL(5,3),
    "rankInCity" INTEGER,
    "lastRatedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "restaurantDishId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "taste" INTEGER,
    "portion" INTEGER,
    "value" INTEGER,
    "comment" TEXT,
    "photoPath" TEXT,
    "status" "RatingStatus" NOT NULL DEFAULT 'ACTIVE',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "ratingId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairwiseVote" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "winnerRdId" TEXT NOT NULL,
    "loserRdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairwiseVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuUpload" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" "MenuUploadStatus" NOT NULL DEFAULT 'PENDING',
    "rawJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedAt" TIMESTAMP(3),

    CONSTRAINT "MenuUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "menuUploadId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawPrice" INTEGER,
    "rawSection" TEXT,
    "matchedDishId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchMethod" "MatchMethod" NOT NULL DEFAULT 'NONE',
    "variantTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "type" "ReviewItemType" NOT NULL,
    "status" "ReviewItemStatus" NOT NULL DEFAULT 'OPEN',
    "payload" JSONB NOT NULL,
    "restaurantId" TEXT,
    "dishId" TEXT,
    "createdByUserId" TEXT,
    "resolvedByUserId" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "restaurantDishId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "FlagReason" NOT NULL,
    "note" TEXT,
    "upheld" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerClaim" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "proofNote" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishStat" (
    "cityId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "meanScore" DOUBLE PRECISION NOT NULL,
    "ratingCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishStat_pkey" PRIMARY KEY ("cityId","dishId")
);

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "summary" JSONB,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Area_cityId_slug_key" ON "Area"("cityId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_googlePlaceId_key" ON "Restaurant"("googlePlaceId");

-- CreateIndex
CREATE INDEX "Restaurant_cityId_status_idx" ON "Restaurant"("cityId", "status");

-- CreateIndex
CREATE INDEX "Restaurant_cityId_areaId_idx" ON "Restaurant"("cityId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "DishCategory_slug_key" ON "DishCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_slug_key" ON "Dish"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DishAlias_alias_key" ON "DishAlias"("alias");

-- CreateIndex
CREATE INDEX "DishAlias_dishId_idx" ON "DishAlias"("dishId");

-- CreateIndex
CREATE INDEX "RestaurantDish_cityId_dishId_status_score_idx" ON "RestaurantDish"("cityId", "dishId", "status", "score" DESC);

-- CreateIndex
CREATE INDEX "RestaurantDish_dishId_status_idx" ON "RestaurantDish"("dishId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDish_restaurantId_dishId_key" ON "RestaurantDish"("restaurantId", "dishId");

-- CreateIndex
CREATE INDEX "Rating_userId_createdAt_idx" ON "Rating"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Rating_restaurantDishId_status_createdAt_idx" ON "Rating"("restaurantDishId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_restaurantDishId_userId_key" ON "Rating"("restaurantDishId", "userId");

-- CreateIndex
CREATE INDEX "PairwiseVote_cityId_dishId_idx" ON "PairwiseVote"("cityId", "dishId");

-- CreateIndex
CREATE INDEX "ReviewItem_status_type_createdAt_idx" ON "ReviewItem"("status", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flag_restaurantDishId_userId_reason_key" ON "Flag"("restaurantDishId", "userId", "reason");

-- CreateIndex
CREATE INDEX "OwnerClaim_status_idx" ON "OwnerClaim"("status");

-- CreateIndex
CREATE INDEX "RankingSnapshot_cityId_dishId_computedAt_idx" ON "RankingSnapshot"("cityId", "dishId", "computedAt");

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DishCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAlias" ADD CONSTRAINT "DishAlias_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDish" ADD CONSTRAINT "RestaurantDish_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDish" ADD CONSTRAINT "RestaurantDish_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_restaurantDishId_fkey" FOREIGN KEY ("restaurantDishId") REFERENCES "RestaurantDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "Rating"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuUpload" ADD CONSTRAINT "MenuUpload_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuUpload" ADD CONSTRAINT "MenuUpload_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuUploadId_fkey" FOREIGN KEY ("menuUploadId") REFERENCES "MenuUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_matchedDishId_fkey" FOREIGN KEY ("matchedDishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_restaurantDishId_fkey" FOREIGN KEY ("restaurantDishId") REFERENCES "RestaurantDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerClaim" ADD CONSTRAINT "OwnerClaim_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerClaim" ADD CONSTRAINT "OwnerClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishStat" ADD CONSTRAINT "DishStat_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishStat" ADD CONSTRAINT "DishStat_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
