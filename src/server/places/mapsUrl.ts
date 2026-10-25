/**
 * "Open in Google Maps" link from a place id (Google Maps URLs, search action). `query` is
 * required by the URL format but only used when Maps cannot find the place id, so it is our own
 * text (dish, area, city or our restaurant name), never a Google name or address.
 */
export function googleMapsUrl(googlePlaceId: string, fallbackQuery: string): string {
  const params = new URLSearchParams({
    api: "1",
    query: fallbackQuery,
    query_place_id: googlePlaceId,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
