// Dish matching pipeline (docs/05 "Matching pipeline"): match first, tag second.
//   1 normalize → 2-3 longest alias + leftover classification → 4 trigram → 5 LLM (menu uploads) → 6 decision
import { env } from "@/env";
import {
  aliasMatch,
  getAliasIndex,
  type AliasIndex,
  type AliasOutcome,
  type DishInfo,
} from "./aliases";
import { createLlmMatcher, type LlmMatcher } from "./llm";
import { normalize, tokenize } from "./normalize";
import { lacksNeededMeat, tagsInText } from "./tags";
import { sqlTrigramSearch, TRIGRAM, type TrigramSearch } from "./trigram";

export { normalize } from "./normalize";
export { AliasIndex, type AliasEntry } from "./aliases";

export const THRESHOLDS = {
  /** Any method at or above this creates/upgrades the RestaurantDish (docs/05 step 6). */
  autoAccept: 0.85,
  /** Review items carry suggestions from this confidence up. */
  suggestMin: 0.45,
  /** Meat-word safety: TRIGRAM and LLM results without a needed meat word are capped here. */
  meatSafetyCap: 0.5,
} as const;

export type MatchMethod = "ALIAS" | "TRIGRAM" | "LLM" | "NONE";

export type MatchCandidate = {
  dishId: string;
  dishSlug: string;
  confidence: number;
  method: Exclude<MatchMethod, "NONE">;
};

export type MatchResult = {
  /** normalize(rawName) */
  text: string;
  dishId: string | null;
  dishSlug: string | null;
  confidence: number;
  method: MatchMethod;
  variantTags: string[];
  /** Review suggestions: alias match first, then trigram; at most 3 dishes. */
  candidates: MatchCandidate[];
  /** docs/05 step 6: auto ≥ 0.85; review with suggestions 0.45-0.85; review without suggestion below. */
  decision: "auto" | "review" | "review-no-suggestion";
  reason?: string;
};

export type MatchOptions = { section?: string; allowLlm?: boolean };

export type MatchDeps = {
  aliasIndex?: () => Promise<AliasIndex>;
  trigram?: TrigramSearch;
  /** null disables step 5. Default: Anthropic when ANTHROPIC_API_KEY and ANTHROPIC_MATCH_MODEL are set. */
  llm?: LlmMatcher | null;
};

let defaultLlm: LlmMatcher | null | undefined;
function getDefaultLlm(): LlmMatcher | null {
  if (defaultLlm === undefined) {
    defaultLlm = createLlmMatcher({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MATCH_MODEL,
    });
  }
  return defaultLlm;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function decisionFor(confidence: number): MatchResult["decision"] {
  if (confidence >= THRESHOLDS.autoAccept) return "auto";
  return confidence >= THRESHOLDS.suggestMin ? "review" : "review-no-suggestion";
}

function aliasCandidates(outcome: AliasOutcome | null): MatchCandidate[] {
  if (!outcome) return [];
  const dishes = outcome.kind === "match" ? [outcome.dish] : outcome.dishes;
  return dishes.map((d) => ({
    dishId: d.id,
    dishSlug: d.slug,
    confidence: outcome.confidence,
    method: "ALIAS",
  }));
}

function distinctByDish(candidates: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => !seen.has(c.dishSlug) && (seen.add(c.dishSlug), true));
}

function result(
  text: string,
  best: MatchCandidate | null,
  rest: Partial<MatchResult> = {},
): MatchResult {
  return {
    text,
    dishId: best?.dishId ?? null,
    dishSlug: best?.dishSlug ?? null,
    confidence: best ? best.confidence : 0,
    method: best?.method ?? "NONE",
    variantTags: [],
    candidates: [],
    decision: decisionFor(best?.confidence ?? 0),
    ...rest,
  };
}

/** Matches one menu or search string to a canonical dish (docs/05). Never creates dishes. */
export async function matchDish(
  rawName: string,
  options: MatchOptions = {},
  deps: MatchDeps = {},
): Promise<MatchResult> {
  const text = normalize(rawName);
  if (!text) return result(text, null);
  const tokens = tokenize(text);
  const index = await (deps.aliasIndex ?? getAliasIndex)();

  // Steps 2-3: an alias match that explains every word is final.
  const alias = aliasMatch(text, index);
  if (alias?.kind === "match" && alias.confidence >= THRESHOLDS.autoAccept) {
    const best = aliasCandidates(alias)[0]!;
    return result(text, best, { variantTags: alias.tags, candidates: [] });
  }

  // Step 4: trigram candidates, capped at 0.80 (never auto) and at 0.50 when a needed meat is missing.
  const capped = lacksNeededMeat(tokens);
  const cap = capped ? THRESHOLDS.meatSafetyCap : TRIGRAM.confidenceCap;
  const trigram: MatchCandidate[] = (await (deps.trigram ?? sqlTrigramSearch)(text)).map((c) => ({
    dishId: c.dishId,
    dishSlug: c.dishSlug,
    confidence: round(Math.min(c.similarity, cap)),
    method: "TRIGRAM",
  }));
  const all = distinctByDish([...aliasCandidates(alias), ...trigram]);
  let best = all[0] ?? null;
  const aliasTags = alias?.kind === "match" ? alias.tags : [];

  // Step 5: LLM, menu uploads only, when nothing reached the auto threshold yet.
  const llm = deps.llm === undefined ? getDefaultLlm() : deps.llm;
  if (
    options.allowLlm &&
    llm &&
    all.length > 0 &&
    (best?.confidence ?? 0) < THRESHOLDS.autoAccept
  ) {
    const dishes = all
      .slice(0, 10)
      .map((c) => index.dishBySlug(c.dishSlug))
      .filter((d): d is DishInfo => !!d);
    const verdict = await llm({
      text,
      section: options.section,
      candidates: dishes.map((d) => ({ slug: d.slug, name: d.name })),
    });
    const dish = verdict?.dishSlug ? index.dishBySlug(verdict.dishSlug) : undefined;
    if (verdict && dish && verdict.confidence >= THRESHOLDS.autoAccept) {
      const pick: MatchCandidate = {
        dishId: dish.id,
        dishSlug: dish.slug,
        confidence: round(
          capped ? Math.min(verdict.confidence, THRESHOLDS.meatSafetyCap) : verdict.confidence,
        ),
        method: "LLM",
      };
      if (pick.confidence >= THRESHOLDS.autoAccept) {
        return result(text, pick, {
          variantTags: tagsInText(tokens, dish),
          reason: verdict.reason,
        });
      }
      // Capped by meat-word safety: the LLM pick becomes the first suggestion.
      best = pick;
      all.unshift(pick);
    }
  }

  const candidates = distinctByDish(all).slice(0, 3);
  return result(text, best, {
    variantTags: best?.method === "ALIAS" ? aliasTags : [],
    candidates: best && best.confidence >= THRESHOLDS.suggestMin ? candidates : [],
  });
}
