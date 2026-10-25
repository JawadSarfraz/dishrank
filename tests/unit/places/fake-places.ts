// A Places client double for service tests: answers Text Search from scripted pages keyed by
// textQuery. Never touches the network. All names and addresses here are made up.
import {
  PlacesApiError,
  PlacesBudgetError,
  type PlaceResult,
  type PlacesClient,
  type TextSearchParams,
} from "@/server/places";

export type ScriptedPage = { places: PlaceResult[]; next?: string } | PlacesApiError;

export function fakePlace(id: string, over: Partial<PlaceResult> = {}): PlaceResult {
  return {
    googlePlaceId: `ChIJfixture${id}`,
    displayName: `Fixture Place ${id}`,
    formattedAddress: `${id} Fixture Road, Test Sector`,
    lat: 33.72,
    lng: 73.05,
    attributions: [],
    ...over,
  };
}

export function scriptedPlaces(pages: Record<string, ScriptedPage[]>, maxCalls = Infinity) {
  let calls = 0;
  const seen: TextSearchParams[] = [];
  const next = (params: TextSearchParams) => {
    if (calls >= maxCalls) throw new PlacesBudgetError(calls);
    calls++;
    seen.push(params);
    const page = pages[params.textQuery]?.shift();
    if (!page) throw new Error(`unexpected query ${params.textQuery}`);
    if (page instanceof PlacesApiError) throw page;
    return page;
  };
  const client: PlacesClient = {
    get calls() {
      return calls;
    },
    async textSearch(params) {
      const page = next(params);
      return {
        places: page.places,
        withoutLocation: 0,
        nextPageToken: page.next,
        fetchedAt: new Date(Date.UTC(2026, 9, 25, 10, 0, calls)),
      };
    },
    async textSearchIds(params) {
      const page = next(params);
      return {
        placeIds: page.places.map((p) => p.googlePlaceId),
        nextPageToken: page.next,
        fetchedAt: new Date(Date.UTC(2026, 9, 25, 10, 0, calls)),
      };
    },
    async placeDetails() {
      throw new Error("not used");
    },
  };
  return { client, seen };
}
