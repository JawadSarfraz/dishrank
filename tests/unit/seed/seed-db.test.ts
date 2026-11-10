import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listFeaturedDishes, replaceFeaturedDishes } from "@/server/repositories/geo.repo";
import { findCityBySlug } from "@/server/repositories/public.repo";
import { findDishesBySlugs, listDishAliases } from "@/server/repositories/taxonomy.repo";
import { applySeedPlan, buildSeedPlan, loadSeedFiles } from "@/server/services/taxonomy-seed";

// Needs a migrated and seeded database (`pnpm db:seed`; CI seeds before running tests).
describe("seeded database", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("has one DishAlias row per seeded spelling, on the right dish", async () => {
    const plan = buildSeedPlan(loadSeedFiles());
    const rows = new Map((await listDishAliases()).map((r) => [r.alias, r.dish.slug]));
    const wrong = [...plan.aliases].filter(([alias, slug]) => rows.get(alias) !== slug);
    expect(wrong).toEqual([]);
  });

  // The seed's featured round applies only to a city with none: an admin's later choice must
  // survive every later `pnpm db:seed` (docs/01 D1a).
  it("seeds the featured round once and never replaces an admin's choice", async () => {
    const files = loadSeedFiles();
    const seeded = files.cities.find((c) => c.featured && c.featured.dishes.length > 0)!;
    const city = (await findCityBySlug(seeded.slug))!;
    expect((await listFeaturedDishes(city.id)).map((f) => f.dish.slug)).toEqual(
      seeded.featured!.dishes,
    );
    expect(city.featuredRound).toBe(seeded.featured!.round ?? null);

    const other = files.dishes.find((d) => !seeded.featured!.dishes.includes(d.slug))!;
    const [dish] = await findDishesBySlugs([other.slug]);
    const closesAt = new Date("2030-01-01T18:59:59Z");
    await replaceFeaturedDishes(city.id, [dish.id], { featuredClosesAt: closesAt, featuredRound: "test round" });
    try {
      await applySeedPlan(buildSeedPlan(files));
      expect((await listFeaturedDishes(city.id)).map((f) => f.dish.slug)).toEqual([other.slug]);
      const after = (await findCityBySlug(seeded.slug))!;
      expect(after.featuredRound).toBe("test round");
      expect(after.featuredClosesAt?.getTime()).toBe(closesAt.getTime());
    } finally {
      // Back to the seed's round, as the seed on an empty city would set it.
      const dishes = await findDishesBySlugs(seeded.featured!.dishes);
      await replaceFeaturedDishes(
        city.id,
        seeded.featured!.dishes.map((s) => dishes.find((d) => d.slug === s)!.id),
        {
          featuredClosesAt: seeded.featured!.closesAt ? new Date(seeded.featured!.closesAt) : null,
          featuredRound: seeded.featured!.round ?? null,
        },
      );
    }
  });
});
