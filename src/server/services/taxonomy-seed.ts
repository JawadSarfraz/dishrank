import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "@/server/db";
import {
  countTaxonomy,
  upsertArea,
  upsertCategory,
  upsertCity,
  upsertDish,
  upsertDishAlias,
} from "@/server/repositories/taxonomy.repo";
import { normalize } from "./matching/normalize";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be a lowercase ASCII slug");
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

const citiesFile = z.array(z.strictObject({ slug, name: z.string().min(1), lat, lng }));
const areasFile = z.array(z.strictObject({ city: slug, slug, name: z.string().min(1), lat, lng }));
const categoriesFile = z.array(
  z.strictObject({ slug, name: z.string().min(1), sortOrder: z.number().int() }),
);
const dishesFile = z.array(
  z.strictObject({
    slug,
    name: z.string().min(1),
    category: slug,
    isLaunch: z.boolean(),
    aliases: z.array(z.string()),
  }),
);

export type SeedFiles = {
  cities: z.infer<typeof citiesFile>;
  areas: z.infer<typeof areasFile>;
  categories: z.infer<typeof categoriesFile>;
  dishes: z.infer<typeof dishesFile>;
};

export type SeedPlan = SeedFiles & {
  /** Every distinct normalised spelling (dish names included) → dish slug. */
  aliases: Map<string, string>;
};

export class SeedError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Seed data is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "SeedError";
  }
}

/** Reads seed/*.json (the dish taxonomy and geography). */
export function loadSeedFiles(dir = path.join(process.cwd(), "seed")): SeedFiles {
  const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  return {
    cities: citiesFile.parse(read("cities.json")),
    areas: areasFile.parse(read("areas.json")),
    categories: categoriesFile.parse(read("dish-categories.json")),
    dishes: dishesFile.parse(read("dishes.json")),
  };
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

/**
 * Validates the seed before anything is written (docs/05 seed rules): unique slugs, known
 * references, every alias already normalised, and no spelling shared by two dishes.
 */
export function buildSeedPlan(files: SeedFiles): SeedPlan {
  const problems: string[] = [];
  const citySlugs = new Set(files.cities.map((c) => c.slug));
  const categorySlugs = new Set(files.categories.map((c) => c.slug));

  for (const d of duplicates(files.cities.map((c) => c.slug)))
    problems.push(`duplicate city slug "${d}"`);
  for (const d of duplicates(files.areas.map((a) => `${a.city}/${a.slug}`)))
    problems.push(`duplicate area "${d}"`);
  for (const d of duplicates(files.categories.map((c) => c.slug)))
    problems.push(`duplicate category slug "${d}"`);
  for (const d of duplicates(files.dishes.map((x) => x.slug)))
    problems.push(`duplicate dish slug "${d}"`);
  for (const a of files.areas)
    if (!citySlugs.has(a.city)) problems.push(`area "${a.slug}" names unknown city "${a.city}"`);
  for (const x of files.dishes)
    if (!categorySlugs.has(x.category))
      problems.push(`dish "${x.slug}" names unknown category "${x.category}"`);

  const aliases = new Map<string, string>();
  for (const dish of files.dishes) {
    const spellings = new Set<string>();
    const name = normalize(dish.name);
    if (!name) problems.push(`dish "${dish.slug}": name normalises to nothing`);
    else spellings.add(name);
    for (const alias of dish.aliases) {
      const normal = normalize(alias);
      if (alias !== normal) {
        problems.push(
          `dish "${dish.slug}": alias "${alias}" is not normalised (normalize gives "${normal}")`,
        );
      } else if (!alias) {
        problems.push(`dish "${dish.slug}": empty alias`);
      } else {
        spellings.add(alias);
      }
    }
    for (const spelling of spellings) {
      const owner = aliases.get(spelling);
      if (owner && owner !== dish.slug) {
        problems.push(`alias "${spelling}" belongs to both "${owner}" and "${dish.slug}"`);
      } else {
        aliases.set(spelling, dish.slug);
      }
    }
  }

  if (problems.length) throw new SeedError(problems);
  return { ...files, aliases };
}

/** Idempotent upserts by slug in one transaction. Never sets or resets City.launchedAt. */
export async function applySeedPlan(plan: SeedPlan) {
  return db.$transaction(
    async (tx) => {
      const cityIds = new Map<string, string>();
      for (const c of plan.cities) cityIds.set(c.slug, (await upsertCity(c, tx)).id);
      for (const a of plan.areas) {
        const { city, ...area } = a;
        await upsertArea({ ...area, cityId: cityIds.get(city)! }, tx);
      }
      const categoryIds = new Map<string, string>();
      for (const c of plan.categories) categoryIds.set(c.slug, (await upsertCategory(c, tx)).id);
      const dishIds = new Map<string, string>();
      for (const d of plan.dishes) {
        const { id } = await upsertDish(
          {
            slug: d.slug,
            name: d.name,
            isLaunch: d.isLaunch,
            categoryId: categoryIds.get(d.category)!,
          },
          tx,
        );
        dishIds.set(d.slug, id);
      }
      for (const [alias, dishSlug] of plan.aliases) {
        await upsertDishAlias({ alias, dishId: dishIds.get(dishSlug)! }, tx);
      }
      return countTaxonomy(tx);
    },
    { timeout: 120_000 },
  );
}
