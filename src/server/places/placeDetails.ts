// Place Details (New), docs/07 §5: location only (Essentials), for the daily coordinate refresh.
import { z } from "zod";

export const PLACE_DETAILS_BASE_URL = "https://places.googleapis.com/v1/places/";

/** Place Details takes field names without the `places.` prefix. */
export const PLACE_DETAILS_FIELD_MASK = "location";

export function buildPlaceDetailsRequest(googlePlaceId: string, apiKey: string) {
  return {
    url: `${PLACE_DETAILS_BASE_URL}${encodeURIComponent(googlePlaceId)}`,
    init: {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
      },
      cache: "no-store", // Google responses are never cached (Next.js fetch cache included)
    } satisfies RequestInit,
  };
}

/** NOT_FOUND (an obsolete place id) is a result, not an error: the refresh job nulls lat/lng at once. */
export type PlaceDetailsResult =
  { kind: "ok"; lat: number; lng: number; fetchedAt: Date } | { kind: "not_found" };

const responseSchema = z.object({
  location: z.object({ latitude: z.number(), longitude: z.number() }),
});

export function parsePlaceDetailsResponse(json: unknown, fetchedAt: Date): PlaceDetailsResult {
  const { location } = responseSchema.parse(json);
  return { kind: "ok", lat: location.latitude, lng: location.longitude, fetchedAt };
}
