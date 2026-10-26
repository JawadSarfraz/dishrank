import { describe, expect, it } from "vitest";
import { normalize } from "@/server/services/matching/normalize";
import { buildSeedPlan, loadSeedFiles, SeedError, type SeedFiles } from "@/server/services/taxonomy-seed";

const files = loadSeedFiles();

function problemsOf(f: SeedFiles): string[] {
  try {
    buildSeedPlan(f);
    return [];
  } catch (e) {
    if (e instanceof SeedError) return e.problems;
    throw e;
  }
}

describe("seed files (docs/05 seed tests)", () => {
  it("every alias equals normalize(alias)", () => {
    const bad = files.dishes.flatMap((d) => d.aliases.filter((a) => normalize(a) !== a).map((a) => `${d.slug}: ${a}`));
    expect(bad).toEqual([]);
  });

  it("no alias string maps to two dishes", () => {
    const owner = new Map<string, Set<string>>();
    for (const d of files.dishes)
      for (const a of [normalize(d.name), ...d.aliases]) owner.set(a, (owner.get(a) ?? new Set()).add(d.slug));
    const shared = [...owner].filter(([, slugs]) => slugs.size > 1).map(([a]) => a);
    expect(shared).toEqual([]);
  });

  it("every dish name is stored as an alias of its own dish", () => {
    const plan = buildSeedPlan(files);
    for (const d of files.dishes) expect(plan.aliases.get(normalize(d.name))).toBe(d.slug);
  });
});

describe("buildSeedPlan rejects bad data before writing anything", () => {
  const dish = files.dishes[0]!;
  const withDishes = (dishes: SeedFiles["dishes"]): SeedFiles => ({ ...files, dishes });

  it("an alias that is not normalised or belongs to two dishes, an unknown category, a duplicate slug", () => {
    const other = files.dishes[1]!;
    const problems = [
      ...problemsOf(withDishes([{ ...dish, aliases: [...dish.aliases, "Chicken Karahi (Full)"] }])),
      ...problemsOf(withDishes([dish, { ...other, aliases: [...other.aliases, dish.aliases[0]!] }])),
      ...problemsOf(withDishes([dish, { ...dish, category: "no-such-category" }])),
    ].join("\n");
    expect(problems).toContain("is not normalised");
    expect(problems).toContain("belongs to both");
    expect(problems).toContain(`duplicate dish slug "${dish.slug}"`);
    expect(problems).toContain('unknown category "no-such-category"');
  });
});
