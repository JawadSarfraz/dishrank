-- Source tags (docs/01 D1b, 2026-11-11): where a visit or an account came from. Adds only.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "source" TEXT;
