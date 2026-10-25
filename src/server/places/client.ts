// Places API (New) client: the only code that talks to Google (CLAUDE.md rules 1-2).
import { PlacesApiError, PlacesBudgetError, readGoogleError } from "./errors";
import {
  buildPlaceDetailsRequest,
  parsePlaceDetailsResponse,
  type PlaceDetailsResult,
} from "./placeDetails";
import {
  TEXT_SEARCH_IDS_FIELD_MASK,
  buildTextSearchRequest,
  parseTextSearchIdsResponse,
  parseTextSearchResponse,
  type TextSearchIdsPage,
  type TextSearchPage,
  type TextSearchParams,
} from "./textSearch";

export type PlacesClientOptions = {
  apiKey: string;
  /** Hard cap on HTTP requests (retries included): the client refuses the request that would exceed it. */
  maxCalls?: number;
  /** Attempts per request; 429 and 5xx (and network failures) are retried with backoff. */
  attempts?: number;
  baseDelayMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

export type PlacesClient = {
  /** Names, addresses and locations: display only (/admin/import). */
  textSearch(params: TextSearchParams): Promise<TextSearchPage>;
  /** Place ids only (pnpm seed:places). */
  textSearchIds(params: TextSearchParams): Promise<TextSearchIdsPage>;
  placeDetails(googlePlaceId: string): Promise<PlaceDetailsResult>;
  /** HTTP requests sent so far, retries included (what Google can bill). */
  readonly calls: number;
};

const isRetryable = (status: number) => status === 429 || status >= 500;

export function createPlacesClient(options: PlacesClientOptions): PlacesClient {
  if (!options.apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => new Date());
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  let calls = 0;

  const backoff = (attempt: number) =>
    baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);

  async function send(url: string, init: RequestInit): Promise<{ json: unknown; at: Date }> {
    for (let attempt = 1; ; attempt++) {
      if (options.maxCalls !== undefined && calls >= options.maxCalls) {
        throw new PlacesBudgetError(calls);
      }
      calls++;
      let response: Response;
      try {
        response = await doFetch(url, init);
      } catch (cause) {
        if (attempt < attempts) {
          await sleep(backoff(attempt));
          continue;
        }
        const message = cause instanceof Error ? cause.message : "network error";
        throw new PlacesApiError(0, "NETWORK_ERROR", message);
      }
      if (response.ok) {
        try {
          return { json: await response.json(), at: now() };
        } catch {
          throw new PlacesApiError(response.status, "BAD_RESPONSE", "response is not JSON");
        }
      }
      const error = await readGoogleError(response);
      if (isRetryable(response.status) && attempt < attempts) {
        await sleep(backoff(attempt));
        continue;
      }
      throw error;
    }
  }

  async function parse<T>(json: unknown, at: Date, parser: (j: unknown, d: Date) => T): Promise<T> {
    try {
      return parser(json, at);
    } catch {
      throw new PlacesApiError(200, "BAD_RESPONSE", "unexpected Places response");
    }
  }

  return {
    get calls() {
      return calls;
    },

    async textSearch(params) {
      const { url, init } = buildTextSearchRequest(params, options.apiKey);
      const { json, at } = await send(url, init);
      return parse(json, at, parseTextSearchResponse);
    },

    async textSearchIds(params) {
      const { url, init } = buildTextSearchRequest(
        params,
        options.apiKey,
        TEXT_SEARCH_IDS_FIELD_MASK,
      );
      const { json, at } = await send(url, init);
      return parse(json, at, parseTextSearchIdsResponse);
    },

    async placeDetails(googlePlaceId) {
      const { url, init } = buildPlaceDetailsRequest(googlePlaceId, options.apiKey);
      let result: { json: unknown; at: Date };
      try {
        result = await send(url, init);
      } catch (error) {
        if (
          error instanceof PlacesApiError &&
          (error.httpStatus === 404 || error.googleStatus === "NOT_FOUND")
        ) {
          return { kind: "not_found" };
        }
        throw error;
      }
      return parse(result.json, result.at, parsePlaceDetailsResponse);
    },
  };
}
