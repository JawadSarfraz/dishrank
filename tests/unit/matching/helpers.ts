// Test doubles for the matching pipeline: an alias index built from seed/*.json and an in-memory
// trigram search with pg_trgm's similarity() semantics (src/lib/trigram.ts). No database, no network.
import { similarity } from "@/lib/trigram";
import { AliasIndex, type AliasEntry, type MatchDeps } from "@/server/services/matching";
import type { TrigramSearch } from "@/server/services/matching/trigram";
import { buildSeedPlan, loadSeedFiles } from "@/server/services/taxonomy-seed";

export function seedAliasEntries(): AliasEntry[] {
  const plan = buildSeedPlan(loadSeedFiles());
  const names = new Map(plan.dishes.map((d) => [d.slug, d.name]));
  return [...plan.aliases].map(([alias, slug]) => ({
    alias,
    dishId: `id-${slug}`,
    dishSlug: slug,
    dishName: names.get(slug)!,
  }));
}

/** Same contract as the SQL search: best alias per dish, similarity ≥ 0.45, top 10, ties by slug. */
export function inMemoryTrigram(entries: AliasEntry[]): TrigramSearch {
  return async (text) => {
    const best = new Map<string, { dishId: string; dishSlug: string; similarity: number }>();
    for (const e of entries) {
      const s = similarity(e.alias, text);
      if (s > (best.get(e.dishSlug)?.similarity ?? -1))
        best.set(e.dishSlug, { dishId: e.dishId, dishSlug: e.dishSlug, similarity: s });
    }
    return [...best.values()]
      .filter((c) => c.similarity >= 0.45)
      .sort((x, y) => y.similarity - x.similarity || x.dishSlug.localeCompare(y.dishSlug))
      .slice(0, 10);
  };
}

const entries = seedAliasEntries();
export const seedIndex = new AliasIndex(entries);

/** Seed alias index + in-memory trigram; the LLM step is off unless a test passes its own fake. */
export function memoryDeps(overrides: Partial<MatchDeps> = {}): MatchDeps {
  return {
    aliasIndex: async () => seedIndex,
    trigram: inMemoryTrigram(entries),
    llm: null,
    ...overrides,
  };
}
