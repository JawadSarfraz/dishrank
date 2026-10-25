// docs/05 step 2: longest alias contained in the text as consecutive whole words, plus the
// meat-word retry. The index is built from DishAlias rows (cached 10 minutes) or, in tests, from
// any list of entries.
import { listDishAliases } from "@/server/repositories/taxonomy.repo";
import { normalize, tokenize } from "./normalize";
import { classifyLeftovers, meatOf, meatsIn, type DishWords } from "./tags";

export const CONFIDENCE = { full: 1, unknownWords: 0.75, conflictOrTie: 0.6 } as const;

export type AliasEntry = { alias: string; dishId: string; dishSlug: string; dishName: string };

export type DishInfo = DishWords & { id: string; slug: string; name: string };

type Hit = { alias: string; dish: DishInfo; start: number; end: number };

export type AliasOutcome =
  | {
      kind: "match";
      dish: DishInfo;
      alias: string;
      confidence: number;
      tags: string[];
      unknown: string[];
      conflicts: string[];
      retried: boolean;
    }
  | { kind: "tie"; dishes: DishInfo[]; aliases: string[]; confidence: number };

export class AliasIndex {
  private readonly byAlias = new Map<string, DishInfo>();
  private readonly bySlug = new Map<string, DishInfo>();
  private readonly maxWords: number;

  constructor(entries: readonly AliasEntry[]) {
    let maxWords = 1;
    for (const e of entries) {
      let dish = this.bySlug.get(e.dishSlug);
      if (!dish) {
        const nameWords = new Set(tokenize(normalize(e.dishName)));
        dish = {
          id: e.dishId,
          slug: e.dishSlug,
          name: e.dishName,
          nameWords,
          meats: meatsIn(nameWords),
        };
        this.bySlug.set(e.dishSlug, dish);
      }
      this.byAlias.set(e.alias, dish);
      maxWords = Math.max(maxWords, tokenize(e.alias).length);
    }
    this.maxWords = maxWords;
  }

  get size(): number {
    return this.byAlias.size;
  }

  dishBySlug(slug: string): DishInfo | undefined {
    return this.bySlug.get(slug);
  }

  /** Longest alias (most characters) found as consecutive whole words; a tie across dishes is reported as such. */
  longest(
    tokens: readonly string[],
  ): { kind: "hit"; hit: Hit } | { kind: "tie"; hits: Hit[] } | null {
    let best: Hit[] = [];
    let bestLength = 0;
    for (let start = 0; start < tokens.length; start++) {
      for (let n = 1; n <= this.maxWords && start + n <= tokens.length; n++) {
        const alias = tokens.slice(start, start + n).join(" ");
        const dish = this.byAlias.get(alias);
        if (!dish) continue;
        const hit = { alias, dish, start, end: start + n };
        if (alias.length > bestLength) {
          best = [hit];
          bestLength = alias.length;
        } else if (alias.length === bestLength) {
          best.push(hit);
        }
      }
    }
    if (best.length === 0) return null;
    const dishes = new Set(best.map((h) => h.dish.slug));
    // Same dish found more than once: keep the earliest occurrence.
    return dishes.size > 1 ? { kind: "tie", hits: best } : { kind: "hit", hit: best[0]! };
  }
}

function evaluate(
  index: AliasIndex,
  tokens: readonly string[],
  retried: boolean,
): AliasOutcome | null {
  const found = index.longest(tokens);
  if (!found) return null;
  if (found.kind === "tie") {
    const dishes = [...new Map(found.hits.map((h) => [h.dish.slug, h.dish])).values()];
    return {
      kind: "tie",
      dishes,
      aliases: found.hits.map((h) => h.alias),
      confidence: CONFIDENCE.conflictOrTie,
    };
  }
  const { hit } = found;
  const leftovers = classifyLeftovers(tokens, [hit.start, hit.end], hit.dish);
  const confidence =
    leftovers.conflicts.length > 0
      ? CONFIDENCE.conflictOrTie
      : leftovers.unknown.length > 0
        ? CONFIDENCE.unknownWords
        : CONFIDENCE.full;
  return { kind: "match", dish: hit.dish, alias: hit.alias, confidence, retried, ...leftovers };
}

/**
 * docs/05 steps 2-3 on normalised text. When no alias is found, or a leftover meat word conflicts,
 * and the text has exactly one meat word, retry with that word moved to the front, then to the end;
 * keep the first retry that matches without a conflict.
 */
export function aliasMatch(text: string, index: AliasIndex): AliasOutcome | null {
  const tokens = tokenize(text);
  const first = evaluate(index, tokens, false);
  const meatWords = tokens.filter((t) => meatOf(t));
  const needsRetry = first === null || (first.kind === "match" && first.conflicts.length > 0);
  if (needsRetry && meatWords.length === 1) {
    const meat = meatWords[0]!;
    const rest = tokens.filter((t) => t !== meat);
    for (const attempt of [
      [meat, ...rest],
      [...rest, meat],
    ]) {
      const retry = evaluate(index, attempt, true);
      if (retry?.kind === "match" && retry.conflicts.length === 0) return retry;
    }
  }
  return first;
}

const CACHE_MS = 10 * 60 * 1000;
let cached: { index: AliasIndex; loadedAt: number } | null = null;

/** Alias index from the DishAlias table, rebuilt at most every 10 minutes. */
export async function getAliasIndex(now: number = Date.now()): Promise<AliasIndex> {
  if (cached && now - cached.loadedAt < CACHE_MS) return cached.index;
  const rows = await listDishAliases();
  const index = new AliasIndex(
    rows.map((r) => ({
      alias: r.alias,
      dishId: r.dish.id,
      dishSlug: r.dish.slug,
      dishName: r.dish.name,
    })),
  );
  cached = { index, loadedAt: now };
  return index;
}

/** Call after aliases change (admin "create dish", seed) so the next match sees them. */
export function invalidateAliasIndex(): void {
  cached = null;
}
