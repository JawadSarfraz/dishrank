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
  it("load without duplicates and with the documented counts", () => {
    const plan = buildSeedPlan(files);
    expect(plan.cities).toHaveLength(2);
    expect(plan.areas).toHaveLength(30);
    expect(plan.categories).toHaveLength(12);
    expect(plan.dishes).toHaveLength(84);
    expect(plan.dishes.filter((d) => d.isLaunch)).toHaveLength(19);
    expect(plan.aliases.size).toBe(478);
  });

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

  it("an alias that is not normalised", () => {
    const problems = problemsOf(withDishes([{ ...dish, aliases: [...dish.aliases, "Chicken Karahi (Full)"] }]));
    expect(problems.join("\n")).toContain("is not normalised");
  });

  it("an alias shared by two dishes", () => {
    const other = files.dishes[1]!;
    const problems = problemsOf(withDishes([dish, { ...other, aliases: [...other.aliases, dish.aliases[0]!] }]));
    expect(problems.join("\n")).toContain("belongs to both");
  });

  it("an unknown category and a duplicate slug", () => {
    const problems = problemsOf(withDishes([dish, { ...dish, category: "no-such-category" }]));
    expect(problems.join("\n")).toContain(`duplicate dish slug "${dish.slug}"`);
    expect(problems.join("\n")).toContain('unknown category "no-such-category"');
  });
});
