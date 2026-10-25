// Likely duplicates among Overture candidates and our restaurants (docs/07 §2): the rule from
// docs/research/overture-coverage.md §4. Pure; the import service loads the rows.
import { haversineKm, type LatLng } from "@/lib/geo";
import { cleanText } from "../matching/normalize";

export const DUPLICATE_RULES = {
  /** Two places this close with similar names are probably one place. */
  metres: 50,
  jaroWinkler: 0.9,
  /** Shorter names only count when they are equal ("KFC" never "contains" anything). */
  minKeyLength: 4,
  /** Hints shown per candidate, per kind (restaurants, other candidates). */
  maxHints: 3,
} as const;

/** Lowercase letters and digits only ("Mc Donald's, F-10" → "mcdonaldsf10"); Urdu-only names stay as typed. */
export function nameKey(name: string): string {
  return cleanText(name).replace(/ /g, "") || name.trim().toLowerCase();
}

/** Jaro-Winkler similarity, 0..1. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k++]) transpositions++;
  }
  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Names that are probably the same place when the places are within 50 m. */
export function similarNames(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (x === y) return true;
  if (x.length < DUPLICATE_RULES.minKeyLength || y.length < DUPLICATE_RULES.minKeyLength)
    return false;
  return jaroWinkler(x, y) >= DUPLICATE_RULES.jaroWinkler || x.includes(y) || y.includes(x);
}

/**
 * The stricter test when one side has no location: equal keys or Jaro-Winkler ≥ 0.9, no containment
 * (otherwise "Cafe" would match every café in the area).
 */
export function sameName(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (x === y) return true;
  if (x.length < DUPLICATE_RULES.minKeyLength || y.length < DUPLICATE_RULES.minKeyLength)
    return false;
  return jaroWinkler(x, y) >= DUPLICATE_RULES.jaroWinkler;
}

export const metresBetween = (a: LatLng, b: LatLng) => Math.round(haversineKm(a, b) * 1000);

/** Grid cells of ~110 m, so only neighbouring cells need a distance check. */
const CELL = 0.001;
const cellOf = (p: LatLng) => [Math.floor(p.lat / CELL), Math.floor(p.lng / CELL)] as const;

/** Points indexed for "everything within 50 m of here". */
export class NearbyIndex<T extends LatLng> {
  private readonly cells = new Map<string, T[]>();

  constructor(points: Iterable<T>) {
    for (const p of points) {
      const [y, x] = cellOf(p);
      const key = `${y}:${x}`;
      const cell = this.cells.get(key);
      if (cell) cell.push(p);
      else this.cells.set(key, [p]);
    }
  }

  /** Points within `metres` of `at`, with their distance. */
  near(at: LatLng, metres: number = DUPLICATE_RULES.metres): { point: T; metres: number }[] {
    const [y, x] = cellOf(at);
    const out: { point: T; metres: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const point of this.cells.get(`${y + dy}:${x + dx}`) ?? []) {
          const m = metresBetween(at, point);
          if (m <= metres) out.push({ point, metres: m });
        }
      }
    }
    return out;
  }
}

export type DedupeCandidate = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  suggestedAreaId: string | null;
};

export type DedupeRestaurant = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  lat: number | null;
  lng: number | null;
  areaId: string | null;
  areaName: string | null;
  status: string;
};

export type RestaurantHint = {
  id: string;
  slug: string;
  name: string;
  areaName: string | null;
  status: string;
  /** null: one of the two has no location, so only the name and area were compared. */
  metres: number | null;
};

/**
 * Our restaurants (of the candidate's city) that are probably this place: within 50 m with a
 * similar name or other name; or, when either has no location, the same name in the candidate's
 * suggested area (in the city when it has none).
 */
export function restaurantHints(
  candidate: DedupeCandidate,
  restaurants: readonly DedupeRestaurant[],
  located: NearbyIndex<DedupeRestaurant & LatLng>,
): RestaurantHint[] {
  const hints: RestaurantHint[] = [];
  const names = (r: DedupeRestaurant) => [r.name, ...r.aliases];
  const hint = (r: DedupeRestaurant, metres: number | null): RestaurantHint => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    areaName: r.areaName,
    status: r.status,
    metres,
  });
  if (candidate.lat !== null && candidate.lng !== null) {
    for (const { point, metres } of located.near({ lat: candidate.lat, lng: candidate.lng })) {
      if (names(point).some((n) => similarNames(n, candidate.name)))
        hints.push(hint(point, metres));
    }
  }
  for (const r of restaurants) {
    const bothLocated = candidate.lat !== null && r.lat !== null && r.lng !== null;
    if (bothLocated) continue;
    if (candidate.suggestedAreaId && r.areaId !== candidate.suggestedAreaId) continue;
    if (names(r).some((n) => sameName(n, candidate.name))) hints.push(hint(r, null));
  }
  return hints
    .sort((a, b) => (a.metres ?? Infinity) - (b.metres ?? Infinity) || a.name.localeCompare(b.name))
    .slice(0, DUPLICATE_RULES.maxHints);
}

/** Other candidates within 50 m with a similar name (both need a location). */
export function candidateHints<T extends DedupeCandidate & LatLng>(
  candidate: DedupeCandidate,
  located: NearbyIndex<T>,
): { point: T; metres: number }[] {
  if (candidate.lat === null || candidate.lng === null) return [];
  return located
    .near({ lat: candidate.lat, lng: candidate.lng })
    .filter(({ point }) => point.id !== candidate.id && similarNames(point.name, candidate.name))
    .sort((a, b) => a.metres - b.metres || a.point.name.localeCompare(b.point.name))
    .slice(0, DUPLICATE_RULES.maxHints);
}

/** Pairs of candidates that are likely duplicates of each other (for the sync summary). */
export function countDuplicatePairs(candidates: readonly DedupeCandidate[]): number {
  const located = candidates.filter(
    (c): c is DedupeCandidate & LatLng => c.lat !== null && c.lng !== null,
  );
  const index = new NearbyIndex(located);
  let pairs = 0;
  for (const c of located) {
    pairs += index
      .near(c)
      .filter(({ point }) => point.id > c.id && similarNames(point.name, c.name)).length;
  }
  return pairs;
}
