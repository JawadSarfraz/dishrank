import { db } from "@/server/db";
import { assertTestDatabaseName } from "./test-database";

/**
 * Empties every table the app writes to (restaurants, ratings, review items, jobs, users…) in the
 * test database. Taxonomy tables (cities, areas, dishes, aliases) keep the seed. Refuses to run
 * unless the connected database's name ends in _test.
 */
export async function resetAppData(): Promise<void> {
  const [row] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  assertTestDatabaseName(row?.name ?? "");
  await db.$executeRawUnsafe(
    `TRUNCATE "OvertureCandidate", "Restaurant", "RestaurantDish", "Rating", "RatingHistory", "Flag", "MenuUpload",
      "MenuItem", "OwnerClaim", "ReviewItem", "JobRun", "RateLimitBucket", "RankingSnapshot",
      "PairwiseVote", "DishStat", "Session", "Account", "Verification", "User" CASCADE`,
  );
  // Seeded cities stay; a test that launched one must not change thresholds for the next file.
  await db.city.updateMany({ data: { launchedAt: null } });
}
