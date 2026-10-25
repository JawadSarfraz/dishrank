-- Google Places is no longer used (docs/02 ADR-13). The restaurant table is empty in every
-- environment so far; these three statements only make the migration safe if it is not.
-- Google coordinates may not outlive their place id and its refresh.
UPDATE "Restaurant" SET "lat" = NULL, "lng" = NULL WHERE "googlePlaceId" IS NOT NULL;
-- Dish rows from the Google import were created by an admin.
UPDATE "RestaurantDish" SET "source" = 'ADMIN' WHERE "source" = 'GOOGLE_SEARCH';
-- Refresh failures refer to Google place ids that are dropped below.
DELETE FROM "ReviewItem" WHERE "type" = 'PLACE_REFRESH_FAILED';

-- AlterEnum
BEGIN;
CREATE TYPE "ReviewItemType_new" AS ENUM ('UNMATCHED_MENU_ITEM', 'DISH_PROPOSAL', 'RESTAURANT_PROPOSAL', 'FLAG', 'SUSPICIOUS_RATINGS', 'OWNER_CLAIM', 'DUPLICATE_RESTAURANT');
ALTER TABLE "ReviewItem" ALTER COLUMN "type" TYPE "ReviewItemType_new" USING ("type"::text::"ReviewItemType_new");
ALTER TYPE "ReviewItemType" RENAME TO "ReviewItemType_old";
ALTER TYPE "ReviewItemType_new" RENAME TO "ReviewItemType";
DROP TYPE "public"."ReviewItemType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SourceType_new" AS ENUM ('PANEL', 'USER', 'OWNER', 'MENU_PHOTO', 'ADMIN');
ALTER TABLE "RestaurantDish" ALTER COLUMN "source" TYPE "SourceType_new" USING ("source"::text::"SourceType_new");
ALTER TYPE "SourceType" RENAME TO "SourceType_old";
ALTER TYPE "SourceType_new" RENAME TO "SourceType";
DROP TYPE "public"."SourceType_old";
COMMIT;

-- DropIndex
DROP INDEX "Restaurant_googlePlaceId_key";

-- AlterTable
ALTER TABLE "Restaurant" DROP COLUMN "googlePlaceId",
DROP COLUMN "googleSyncedAt";
