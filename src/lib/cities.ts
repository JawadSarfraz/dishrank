// The launch cities for navigation (the desktop top bar's city switch, the tab bar's links), read
// from the seed file at build time so no page needs the database for its header. The first city is
// the one "/" shows.
import seed from "../../seed/cities.json";

export const CITIES: readonly { slug: string; name: string }[] = seed.map((c) => ({
  slug: c.slug,
  name: c.name,
}));

export const DEFAULT_CITY = CITIES[0]!.slug;

/** The city a path belongs to ("/rawalpindi/best-nihari" → "rawalpindi"), else the default. */
export function cityOfPath(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  return CITIES.some((c) => c.slug === first) ? first : DEFAULT_CITY;
}

/** The id of the dish search field: the Search tab opens `/<city>#find-a-dish`. */
export const SEARCH_ANCHOR = "find-a-dish";
