// docs/05 step 4: trigram candidates from DishAlias (pg_trgm similarity, one alias at a time).
import { findTrigramMatches } from "@/server/repositories/taxonomy.repo";

export const TRIGRAM = { minSimilarity: 0.45, confidenceCap: 0.8, limit: 10 } as const;

export type TrigramCandidate = { dishId: string; dishSlug: string; similarity: number };

/** Up to 10 dishes, best alias each, similarity ≥ 0.45, highest first (ties by slug). */
export type TrigramSearch = (text: string) => Promise<TrigramCandidate[]>;

export const sqlTrigramSearch: TrigramSearch = async (text) => {
  const rows = await findTrigramMatches(text, TRIGRAM.minSimilarity, TRIGRAM.limit);
  return rows.filter((r) => r.similarity >= TRIGRAM.minSimilarity);
};
