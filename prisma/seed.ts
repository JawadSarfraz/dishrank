// `pnpm db:seed` (prisma db seed → tsx prisma/seed.ts): cities, areas, dish categories, dishes and
// one DishAlias row per distinct normalised name or alias, from seed/*.json. Idempotent.
import { db } from "@/server/db";
import { applySeedPlan, buildSeedPlan, loadSeedFiles } from "@/server/services/taxonomy-seed";

async function main() {
  const plan = buildSeedPlan(loadSeedFiles());
  const counts = await applySeedPlan(plan);
  console.log(
    `db:seed: ${counts.cities} cities, ${counts.areas} areas, ${counts.categories} categories, ` +
      `${counts.dishes} dishes, ${counts.aliases} aliases (seed files: ${plan.dishes.length} dishes, ` +
      `${plan.aliases.size} aliases).`,
  );
  if (counts.aliases !== plan.aliases.size) {
    console.warn(
      "db:seed: the database has aliases that are not in seed/dishes.json (admin-added or removed from the seed); none were deleted.",
    );
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await db.$disconnect();
    process.exit(1);
  });
