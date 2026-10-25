import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { countTaxonomy, listDishAliases } from "@/server/repositories/taxonomy.repo";
import { buildSeedPlan, loadSeedFiles } from "@/server/services/taxonomy-seed";

// Needs a migrated and seeded database (`pnpm db:seed`; CI seeds before running tests).
describe("seeded database", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("holds the seed's cities, areas, categories and dishes", async () => {
    const plan = buildSeedPlan(loadSeedFiles());
    const counts = await countTaxonomy();
    expect(counts.cities).toBe(plan.cities.length);
    expect(counts.areas).toBe(plan.areas.length);
    expect(counts.categories).toBe(plan.categories.length);
    expect(counts.dishes).toBeGreaterThanOrEqual(plan.dishes.length); // admins may add dishes later
  });

  it("has one DishAlias row per seeded spelling, on the right dish", async () => {
    const plan = buildSeedPlan(loadSeedFiles());
    const rows = new Map((await listDishAliases()).map((r) => [r.alias, r.dish.slug]));
    const wrong = [...plan.aliases].filter(([alias, slug]) => rows.get(alias) !== slug);
    expect(wrong).toEqual([]);
  });
});
