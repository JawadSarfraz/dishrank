// Overture Maps places → DishRank candidates (docs/07 §1). Pure: the DuckDB reader in
// scripts/lib/overture.ts supplies the records, overture-sync.service writes the result.
import { haversineKm, type LatLng } from "@/lib/geo";
import { phone as phoneSchema } from "@/server/validation/common";

/** One Overture place as the reader returns it (places theme, release 2026-10-21.0). */
export type OverturePlace = {
  /** GERS id. */
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  confidence: number | null;
  operatingStatus: string | null;
  category: string | null;
  alternates: string[];
  hierarchy: string[];
  /** Whole-record sources (property ""); single-property sources are left out by the reader. */
  sources: { dataset: string; license: string }[];
  address: string | null;
  locality: string | null;
  phones: string[];
  websites: string[];
};

export const OVERTURE_RULES = {
  /** CDLA Permissive 2.0 datasets we keep. AllThePlaces is scraped (rule 1); Foursquare is Apache 2.0. */
  datasets: ["meta", "microsoft"],
  license: "CDLA-Permissive-2.0",
  /** ≥ this many places on one rounded point (~10 m), mostly with different addresses = a geocoder fallback. */
  placeholderMin: 10,
  /** A place counts for the city of its nearest seed area centre within this distance (`--margin-km`). */
  marginKm: 5,
  /** Suggested area: the nearest seed area centre within this distance. */
  // DECISION-PENDING: 1.5 km covers a 2 km Islamabad sector from its centre; big areas (Bahria, DHA) get no suggestion farther out.
  areaKm: 1.5,
  websiteMax: 300,
} as const;

export function isFoodAndDrink(hierarchy: readonly string[]): boolean {
  return hierarchy[0] === "food_and_drink" && hierarchy[1] !== "alcoholic_beverage_venue";
}

/** Every whole-record source is Meta or Microsoft under CDLA Permissive 2.0. */
export function hasOpenSources(sources: OverturePlace["sources"]): boolean {
  return (
    sources.length > 0 &&
    sources.every(
      (s) =>
        (OVERTURE_RULES.datasets as readonly string[]).includes(s.dataset.toLowerCase()) &&
        s.license === OVERTURE_RULES.license,
    )
  );
}

/** Google hosts: Maps, its short links and shares. Their links are never kept. */
const GOOGLE_HOST = /(^|\.)(google\.[a-z]{2,3}(\.[a-z]{2})?|goo\.gl|g\.page|g\.co|share\.google)$/;

/** The host of a link-like token; bare words with a dot ("G.Co.") are text, not links. */
function linkHost(token: string): string | null {
  const m = /^(?:(https?):\/\/)?([a-z0-9.-]+\.[a-z]{2,})([/?#].*)?$/i.exec(token);
  if (!m) return null;
  const [, scheme, host, rest] = m;
  if (!scheme && !rest && !/^www\./i.test(host)) return null;
  return host.toLowerCase();
}

/** True for a link to a Google host (maps.app.goo.gl/…, google.com/maps/…, g.page/…). */
export function isGoogleLink(token: string): boolean {
  const host = linkHost(
    token
      .trim()
      .replace(/^[("'<[]+/, "")
      .replace(/[)"'>\].,;:!?]+$/, ""),
  );
  return host !== null && GOOGLE_HOST.test(host);
}

/** The text without Google links (tidied only when one was removed); null when nothing is left. */
export function stripGoogleLinks(text: string | null): string | null {
  const tokens = (text ?? "").split(/\s+/).filter(Boolean);
  if (!tokens.some(isGoogleLink)) return tokens.join(" ") || null;
  const kept = tokens
    .filter((t) => !isGoogleLink(t))
    .join(" ")
    .replace(/\s+([,;])/g, "$1")
    .replace(/([,;])(\s*[,;])+/g, "$1")
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "");
  return kept || null;
}

/** The first http(s) website that is not a Google link. */
export function pickWebsite(websites: readonly string[]): string | null {
  for (const raw of websites) {
    const site = raw.trim();
    if (
      /^https?:\/\//i.test(site) &&
      site.length <= OVERTURE_RULES.websiteMax &&
      !isGoogleLink(site)
    )
      return site;
  }
  return null;
}

/** The first phone number our form accepts, normalised the same way ("+92 51 1234567" → "+92511234567"). */
export function pickPhone(phones: readonly string[]): string | null {
  for (const raw of phones) {
    const parsed = phoneSchema.safeParse(raw.replace(/[().\s]+/g, " ").trim());
    if (parsed.success) return parsed.data;
  }
  return null;
}

const pointKey = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

/**
 * Rounded points that are geocoder fallbacks rather than locations: at least 10 places, most with
 * different addresses (docs/research/overture-coverage.md). Counted over every place in the box,
 * food or not, because the food places alone are too few to show the pattern.
 */
export function placeholderPoints(
  places: readonly Pick<OverturePlace, "lat" | "lng" | "address" | "locality">[],
): Set<string> {
  const groups = new Map<string, { n: number; addresses: Set<string> }>();
  for (const p of places) {
    const key = pointKey(p);
    const group = groups.get(key) ?? { n: 0, addresses: new Set<string>() };
    group.n++;
    group.addresses.add(`${p.address ?? ""} ${p.locality ?? ""}`);
    groups.set(key, group);
  }
  return new Set(
    [...groups]
      .filter(([, g]) => g.n >= OVERTURE_RULES.placeholderMin && g.addresses.size * 2 >= g.n)
      .map(([key]) => key),
  );
}

export type SeedArea = { id: string; cityId: string; citySlug: string; lat: number; lng: number };

/** The nearest seed area centre (ties: the first in `areas`). */
export function nearestArea(point: LatLng, areas: readonly SeedArea[]) {
  let best: { area: SeedArea; km: number } | null = null;
  for (const area of areas) {
    const km = haversineKm(point, area);
    if (!best || km < best.km) best = { area, km };
  }
  return best;
}

export type CandidateDraft = {
  overtureId: string;
  cityId: string;
  citySlug: string;
  suggestedAreaId: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  alternates: string[];
  confidence: number;
  /** Both null: the place sits on a placeholder point (location unknown). */
  lat: number | null;
  lng: number | null;
  sources: string[];
};

export type BuildStats = {
  places: number;
  food: number;
  /** Food places left out, by the dataset that is not Meta or Microsoft. */
  otherSources: Record<string, number>;
  noName: number;
  closed: number;
  /** Farther than marginKm from every seed area centre. */
  outside: number;
  locationUnknown: number;
  googleLinksRemoved: number;
  kept: number;
};

/**
 * The candidates in a set of Overture places: food and drink from Meta or Microsoft, with a name,
 * not permanently closed, within `marginKm` of a seed area centre. Google links are removed from
 * the address and websites; a place on a placeholder point keeps its city (the point's) but gets no
 * coordinates and no area.
 */
export function buildCandidates(
  places: readonly OverturePlace[],
  areas: readonly SeedArea[],
  marginKm: number = OVERTURE_RULES.marginKm,
): { drafts: CandidateDraft[]; stats: BuildStats } {
  const placeholders = placeholderPoints(places);
  const stats: BuildStats = {
    places: places.length,
    food: 0,
    otherSources: {},
    noName: 0,
    closed: 0,
    outside: 0,
    locationUnknown: 0,
    googleLinksRemoved: 0,
    kept: 0,
  };
  const drafts: CandidateDraft[] = [];
  for (const p of places) {
    if (!isFoodAndDrink(p.hierarchy)) continue;
    stats.food++;
    if (!hasOpenSources(p.sources)) {
      const other = p.sources.find(
        (s) => !(OVERTURE_RULES.datasets as readonly string[]).includes(s.dataset.toLowerCase()),
      );
      const key = other?.dataset ?? "(no source)";
      stats.otherSources[key] = (stats.otherSources[key] ?? 0) + 1;
      continue;
    }
    const name = (p.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) {
      stats.noName++;
      continue;
    }
    if (p.operatingStatus === "permanently_closed") {
      stats.closed++;
      continue;
    }
    const nearest = nearestArea(p, areas);
    if (!nearest || nearest.km > marginKm) {
      stats.outside++;
      continue;
    }
    const unknown = placeholders.has(pointKey(p));
    if (unknown) stats.locationUnknown++;
    const rawAddress = (p.address ?? "").split(/\s+/).filter(Boolean).join(" ") || null;
    const address = stripGoogleLinks(rawAddress);
    if (address !== rawAddress || p.websites.some(isGoogleLink)) stats.googleLinksRemoved++;
    drafts.push({
      overtureId: p.id,
      cityId: nearest.area.cityId,
      citySlug: nearest.area.citySlug,
      suggestedAreaId: !unknown && nearest.km <= OVERTURE_RULES.areaKm ? nearest.area.id : null,
      name,
      address,
      phone: pickPhone(p.phones),
      website: pickWebsite(p.websites),
      category: p.category,
      alternates: p.alternates,
      confidence: p.confidence ?? 0,
      lat: unknown ? null : p.lat,
      lng: unknown ? null : p.lng,
      sources: [...new Set(p.sources.map((s) => s.dataset))].sort(),
    });
  }
  stats.kept = drafts.length;
  return { drafts, stats };
}

/** Releases look like 2026-10-21.0: the date, then a counter. */
export const RELEASE_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;

/** Negative when release `a` is older than `b`. */
export function compareReleases(a: string, b: string): number {
  const [dateA, nA] = a.split(".");
  const [dateB, nB] = b.split(".");
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return Number(nA) - Number(nB);
}
