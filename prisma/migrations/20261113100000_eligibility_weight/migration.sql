-- Eligibility without time decay (docs/04, owner 2026-11-13): the trust of a row's counted ratings,
-- summed without decay, so a place that qualified does not drop off the list again without new
-- votes. The score keeps using the decayed weightSum. Adds only.
-- AlterTable
ALTER TABLE "RestaurantDish" ADD COLUMN     "eligibilityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Fill it from the counted ratings (the same rule as listCountedRatings: active ratings of users
-- who are not banned, never the claimed owner's), with each rater's current trust.
UPDATE "RestaurantDish" rd
SET "eligibilityWeight" = s.weight
FROM (
  SELECT rt."restaurantDishId" AS id, SUM(u."trustScore") AS weight
  FROM "Rating" rt
  JOIN "User" u ON u.id = rt."userId"
  JOIN "RestaurantDish" d ON d.id = rt."restaurantDishId"
  JOIN "Restaurant" r ON r.id = d."restaurantId"
  WHERE rt.status = 'ACTIVE'
    AND u."bannedAt" IS NULL
    AND (r."claimedByUserId" IS NULL OR rt."userId" <> r."claimedByUserId")
  GROUP BY rt."restaurantDishId"
) s
WHERE rd.id = s.id;
