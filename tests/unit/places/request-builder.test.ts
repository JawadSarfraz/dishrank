import { describe, expect, it } from "vitest";
import {
  PLACE_DETAILS_FIELD_MASK,
  TEXT_SEARCH_FIELD_MASK,
  TEXT_SEARCH_IDS_FIELD_MASK,
  buildPlaceDetailsRequest,
  buildTextSearchBody,
  buildTextSearchRequest,
  googleMapsUrl,
} from "@/server/places";
import { parseTextSearchIdsResponse, parseTextSearchResponse } from "@/server/places/textSearch";

const KEY = "test-key-not-real";
const params = {
  textQuery: "Chicken Karahi F-7 Islamabad",
  includedType: "restaurant",
  restriction: { low: { lat: 33.694, lng: 73.0245 }, high: { lat: 33.749, lng: 73.0893 } },
};

describe("Text Search request (docs/07 §1-2)", () => {
  it("restricts results to a rectangle and sends the documented body, headers and field mask", () => {
    const { url, init } = buildTextSearchRequest(params, KEY);
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.attributions,nextPageToken",
    });
    expect(JSON.parse(init.body)).toEqual({
      textQuery: "Chicken Karahi F-7 Islamabad",
      includedType: "restaurant",
      locationRestriction: {
        rectangle: {
          low: { latitude: 33.694, longitude: 73.0245 },
          high: { latitude: 33.749, longitude: 73.0893 },
        },
      },
      pageSize: 20,
      regionCode: "PK",
      languageCode: "en",
    });
  });

  it("never sends locationBias with locationRestriction (Google refuses both)", () => {
    expect(buildTextSearchBody(params)).not.toHaveProperty("locationBias");
  });

  it("keeps the import mask to id, name, address, location and attributions; the planning mask to ids", () => {
    expect(TEXT_SEARCH_FIELD_MASK.split(",")).toEqual([
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.attributions", // data providers Google requires us to credit (IDs Only group)
      "nextPageToken", // without it only page 1 ever comes back
    ]);
    expect(TEXT_SEARCH_IDS_FIELD_MASK).toBe("places.id,nextPageToken");
    const ids = buildTextSearchRequest(params, KEY, TEXT_SEARCH_IDS_FIELD_MASK);
    expect(ids.init.headers["X-Goog-FieldMask"]).toBe("places.id,nextPageToken");
    expect(ids.init.cache).toBe("no-store");
  });

  it("sends the next page as the same body plus pageToken", () => {
    const first = buildTextSearchBody(params);
    const next = buildTextSearchBody({ ...params, pageToken: "tok-2" });
    expect(next).toEqual({ ...first, pageToken: "tok-2" });
  });

  it("omits includedType when the dish's venues are not restaurants", () => {
    const body = buildTextSearchBody({ ...params, includedType: undefined });
    expect(body).not.toHaveProperty("includedType");
    expect(body).not.toHaveProperty("strictTypeFiltering"); // stays at Google's default, false
  });
});

describe("Place Details request (docs/07 §5)", () => {
  it("asks only for location, with the unprefixed field mask, and is never cached", () => {
    const { url, init } = buildPlaceDetailsRequest("ChIJ_fixture-123", KEY);
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJ_fixture-123");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "location" });
    expect(PLACE_DETAILS_FIELD_MASK).toBe("location");
  });

  it("encodes the place id into the path", () => {
    expect(buildPlaceDetailsRequest("a/b?c", KEY).url).toBe(
      "https://places.googleapis.com/v1/places/a%2Fb%3Fc",
    );
  });
});

describe("Text Search responses", () => {
  const at = new Date("2026-10-25T10:00:00Z");
  const fixture = {
    places: [
      {
        id: "p1",
        displayName: { text: "Fixture Karahi House", languageCode: "en" },
        formattedAddress: "Plot 1, Fixture Road",
        location: { latitude: 33.72, longitude: 73.05 },
        attributions: [{ provider: "Fixture Data Co", providerUri: "https://fixture.example" }],
        rating: 4.9,
      },
      { id: "p2", displayName: { text: "No location" } },
    ],
    nextPageToken: "tok-2",
  };

  it("maps every result for display, in Google's order, with the page token and fetch time", () => {
    const page = parseTextSearchResponse(fixture, at);
    expect(page.places).toEqual([
      {
        googlePlaceId: "p1",
        displayName: "Fixture Karahi House",
        formattedAddress: "Plot 1, Fixture Road",
        lat: 33.72,
        lng: 73.05,
        attributions: [{ provider: "Fixture Data Co", providerUri: "https://fixture.example" }],
      },
      {
        // kept, not dropped (search results are shown unmodified); it just cannot be imported
        googlePlaceId: "p2",
        displayName: "No location",
        formattedAddress: "",
        lat: null,
        lng: null,
        attributions: [],
      },
    ]);
    expect(page).toMatchObject({ nextPageToken: "tok-2", fetchedAt: at });
  });

  it("reads only place ids for the planning tool, ignoring any name or address sent back", () => {
    const page = parseTextSearchIdsResponse(fixture, at);
    expect(page).toEqual({ placeIds: ["p1", "p2"], nextPageToken: "tok-2", fetchedAt: at });
    expect(JSON.stringify(page)).not.toMatch(/Fixture Karahi House|Fixture Road/);
  });

  it("treats an empty response as no results and no next page", () => {
    expect(parseTextSearchResponse({}, at)).toMatchObject({ places: [], nextPageToken: undefined });
  });
});

describe("Open in Google Maps", () => {
  it("links by place id, with our own text as the required fallback query", () => {
    expect(googleMapsUrl("ChIJ_fixture-1", "Chicken Karahi F-7 Islamabad")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Chicken+Karahi+F-7+Islamabad&query_place_id=ChIJ_fixture-1",
    );
  });
});
