// Text Search (New), docs/07 §1. Used only by `pnpm seed:places`; results go to a CSV, never the DB.
import { z } from "zod";

export const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * places.id + nextPageToken are Essentials (IDs Only); displayName, formattedAddress, location and
 * primaryType make each call Text Search Pro. Nothing from Enterprise (rating, userRatingCount,
 * priceLevel, phone, website, hours, reviews). nextPageToken must be in the mask, otherwise the
 * response carries no token and only page 1 comes back.
 */
export const TEXT_SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,nextPageToken";

export const TEXT_SEARCH = {
  pageSize: 20,
  maxPages: 3, // Text Search returns at most 60 results
  radiusMeters: 2500,
  regionCode: "PK",
  languageCode: "en",
} as const;

export type TextSearchParams = {
  textQuery: string;
  /** Biases results only (strictTypeFiltering stays false); omitted for non-restaurant venues. */
  includedType?: string;
  center: { latitude: number; longitude: number };
  /** Resend the same params plus the previous page's nextPageToken. */
  pageToken?: string;
};

export function buildTextSearchBody(params: TextSearchParams) {
  return {
    textQuery: params.textQuery,
    ...(params.includedType ? { includedType: params.includedType } : {}),
    locationBias: {
      circle: {
        center: { latitude: params.center.latitude, longitude: params.center.longitude },
        radius: TEXT_SEARCH.radiusMeters,
      },
    },
    pageSize: TEXT_SEARCH.pageSize,
    regionCode: TEXT_SEARCH.regionCode,
    languageCode: TEXT_SEARCH.languageCode,
    ...(params.pageToken ? { pageToken: params.pageToken } : {}),
  };
}

export function buildTextSearchRequest(params: TextSearchParams, apiKey: string) {
  return {
    url: TEXT_SEARCH_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(buildTextSearchBody(params)),
    } satisfies RequestInit,
  };
}

/** One search result as the seed CSV stores it. */
export type PlaceCandidate = {
  googlePlaceId: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  primaryType: string;
};

export type TextSearchPage = {
  places: PlaceCandidate[];
  /** Results Google returned without a location: they cannot be imported, so they are dropped. */
  withoutLocation: number;
  nextPageToken?: string;
  /** Time the response arrived: the CSV fetchedAt of every row on this page. */
  fetchedAt: Date;
};

const responseSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string().min(1),
        displayName: z.object({ text: z.string() }).optional(),
        formattedAddress: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
        primaryType: z.string().optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

export function parseTextSearchResponse(json: unknown, fetchedAt: Date): TextSearchPage {
  const body = responseSchema.parse(json);
  const places: PlaceCandidate[] = [];
  let withoutLocation = 0;
  for (const p of body.places ?? []) {
    if (!p.location) {
      withoutLocation++;
      continue;
    }
    places.push({
      googlePlaceId: p.id,
      displayName: p.displayName?.text ?? "",
      formattedAddress: p.formattedAddress ?? "",
      lat: p.location.latitude,
      lng: p.location.longitude,
      primaryType: p.primaryType ?? "",
    });
  }
  return {
    places,
    withoutLocation,
    nextPageToken: body.nextPageToken || undefined,
    fetchedAt,
  };
}
