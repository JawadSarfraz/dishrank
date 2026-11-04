-- CreateEnum
CREATE TYPE "AnalyticsEventName" AS ENUM ('RATING_SUBMITTED', 'SEARCH', 'RANKING_VIEW');

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" "AnalyticsEventName" NOT NULL,
    "citySlug" TEXT,
    "dishSlug" TEXT,
    "day" DATE NOT NULL,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_day_idx" ON "AnalyticsEvent"("name", "day");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_day_idx" ON "AnalyticsEvent"("day");

