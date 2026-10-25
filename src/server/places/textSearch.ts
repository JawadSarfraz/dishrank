// Text Search (New): the live search on /admin/import and the pnpm seed:places planning tool.
// Google names and addresses are for display only: never saved, logged, cached or used to prefill
// (CLAUDE.md rule 2; Maps Platform Terms 3.2.3).
import { z } from "zod";
import type { LatLng } from "@/lib/geo";

export const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * /admin/import: id, displayName, formattedAddress and location (Text Search Pro), plus the data
 * provider attributions Google requires to be shown with a result (IDs Only group, no extra
 * charge). Nothing from Enterprise (rating, userRatingCount, priceLevel, phone, website, hours,
 * reviews). nextPageToken must be in the mask, otherwise only page 1 ever comes back.
 */
export const TEXT_SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.attributions,nextPageToken";

/** pnpm seed:places: place ids only (Text Search Essentials IDs Only, no charge). */
export const TEXT_SEARCH_IDS_FIELD_MASK = "places.id,nextPageToken";

export const TEXT_SEARCH = {
  pageSize: 20,
  maxPages: 3, // Text Search returns at most 60 results
  regionCode: "PK",
  languageCode: "en",
} as const;

export type TextSearchParams = {
  textQuery: string;
  /** Biases results only (strictTypeFiltering stays false); omitted for non-restaurant venues. */
  includedType?: string;
  /** locationRestriction: only places inside this rectangle come back (a search can't drift to Lahore). */
  restriction: { low: LatLng; high: LatLng };
  /** Resend the same params plus the previous page's nextPageToken. */
  pageToken?: string;
};

const point = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export function buildTextSearchBody(params: TextSearchParams) {
  return {
    textQuery: params.textQuery,
    ...(params.includedType ? { includedType: params.includedType } : {}),
    locationRestriction: {
      rectangle: { low: point(params.restriction.low), high: point(params.restriction.high) },
    },
    pageSize: TEXT_SEARCH.pageSize,
    regionCode: TEXT_SEARCH.regionCode,
    languageCode: TEXT_SEARCH.languageCode,
    ...(params.pageToken ? { pageToken: params.pageToken } : {}),
  };
}

export function buildTextSearchRequest(
  params: TextSearchParams,
  apiKey: string,
  fieldMask: string = TEXT_SEARCH_FIELD_MASK,
) {
  return {
    url: TEXT_SEARCH_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(buildTextSearchBody(params)),
      cache: "no-store", // Google responses are never cached (Next.js fetch cache included)
    } satisfies RequestInit,
  };
}

/** One search result, held in memory and shown to the admin; only the id and location may be saved. */
export type PlaceResult = {
  googlePlaceId: string;
  displayName: string;
  formattedAddress: string;
  /** null when Google gives no location: shown, but it cannot be imported. */
  lat: number | null;
  lng: number | null;
  /** Data providers Google requires to be credited next to this result (display only). */
  attributions: { provider: string; providerUri: string | null }[];
};

export type TextSearchPage = {
  /** Every result Google returned, in Google's order (search results are shown unmodified). */
  places: PlaceResult[];
  nextPageToken?: string;
  /** Time the response arrived: googleSyncedAt for a Create or Link from this page. */
  fetchedAt: Date;
};

export type TextSearchIdsPage = {
  placeIds: string[];
  nextPageToken?: string;
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
        attributions: z
          .array(z.object({ provider: z.string(), providerUri: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

export function parseTextSearchResponse(json: unknown, fetchedAt: Date): TextSearchPage {
  const body = responseSchema.parse(json);
  const places = (body.places ?? []).map((p): PlaceResult => ({
    googlePlaceId: p.id,
    displayName: p.displayName?.text ?? "",
    formattedAddress: p.formattedAddress ?? "",
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    attributions: (p.attributions ?? []).map((a) => ({
      provider: a.provider,
      providerUri: a.providerUri ?? null,
    })),
  }));
  return { places, nextPageToken: body.nextPageToken || undefined, fetchedAt };
}

const idsSchema = z.object({
  places: z.array(z.object({ id: z.string().min(1) })).optional(),
  nextPageToken: z.string().optional(),
});

/** Reads place ids only; any other field in the response is ignored, never copied. */
export function parseTextSearchIdsResponse(json: unknown, fetchedAt: Date): TextSearchIdsPage {
  const body = idsSchema.parse(json);
  return {
    placeIds: (body.places ?? []).map((p) => p.id),
    nextPageToken: body.nextPageToken || undefined,
    fetchedAt,
  };
}
