// Structured data (schema.org) for the public pages. A restaurant never carries an aggregateRating:
// DishRank rates dishes, never a restaurant as a whole (CLAUDE.md).
import { absoluteUrl } from "./site";

export type JsonLdRestaurant = {
  slug: string;
  name: string;
  citySlug: string;
  cityName: string;
  areaName: string | null;
  address?: string | null;
  phone?: string | null;
  lat: number | null;
  lng: number | null;
};

export function restaurantJsonLd(r: JsonLdRestaurant) {
  return {
    "@type": "Restaurant",
    name: r.name,
    url: absoluteUrl(`/${r.citySlug}/r/${r.slug}`),
    address: {
      "@type": "PostalAddress",
      ...(r.address ? { streetAddress: r.address } : {}),
      addressLocality: r.areaName ?? r.cityName,
      addressRegion: r.cityName,
      addressCountry: "PK",
    },
    ...(r.phone ? { telephone: r.phone } : {}),
    ...(r.lat !== null && r.lng !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lng } }
      : {}),
  };
}

/** The ranking page: its ranked restaurants in rank order. */
export function rankingJsonLd(input: {
  title: string;
  path: string;
  items: (JsonLdRestaurant & { rank: number })[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: input.title,
    url: absoluteUrl(input.path),
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item) => ({
      "@type": "ListItem",
      position: item.rank,
      item: restaurantJsonLd(item),
    })),
  };
}
