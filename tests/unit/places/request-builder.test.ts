import { describe, expect, it } from "vitest";
import {
  PLACE_DETAILS_FIELD_MASK,
  TEXT_SEARCH_FIELD_MASK,
  buildPlaceDetailsRequest,
  buildTextSearchBody,
  buildTextSearchRequest,
} from "@/server/places";
import { parseTextSearchResponse } from "@/server/places/textSearch";

const KEY = "test-key-not-real";
const params = {
  textQuery: "Chicken Karahi F-7 Islamabad",
  includedType: "restaurant",
  center: { latitude: 33.7215, longitude: 73.0569 },
};

describe("Text Search request (docs/07 §1)", () => {
  it("matches the documented body, headers and field mask", () => {
    const { url, init } = buildTextSearchRequest(params, KEY);
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,nextPageToken",
    });
    expect(JSON.parse(init.body)).toEqual({
      textQuery: "Chicken Karahi F-7 Islamabad",
      includedType: "restaurant",
      locationBias: {
        circle: { center: { latitude: 33.7215, longitude: 73.0569 }, radius: 2500 },
      },
      pageSize: 20,
      regionCode: "PK",
      languageCode: "en",
    });
  });

  it("keeps the field mask in the cheapest tier that has names and locations", () => {
    const fields = TEXT_SEARCH_FIELD_MASK.split(",");
    expect(fields).toContain("nextPageToken"); // without it only page 1 ever comes back
    expect(fields).toHaveLength(6);
    for (const expensive of [
      "rating",
      "userRatingCount",
      "priceLevel",
      "nationalPhoneNumber",
      "internationalPhoneNumber",
      "websiteUri",
      "regularOpeningHours",
      "currentOpeningHours",
      "reviews",
      "photos",
    ]) {
      expect(TEXT_SEARCH_FIELD_MASK).not.toContain(expensive);
    }
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
  it("asks only for location, with the unprefixed field mask", () => {
    const { url, init } = buildPlaceDetailsRequest("ChIJ_abc-123", KEY);
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJ_abc-123");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "location" });
    expect(PLACE_DETAILS_FIELD_MASK).toBe("location");
  });

  it("encodes the place id into the path", () => {
    expect(buildPlaceDetailsRequest("a/b?c", KEY).url).toBe(
      "https://places.googleapis.com/v1/places/a%2Fb%3Fc",
    );
  });
});

describe("Text Search response", () => {
  const at = new Date("2026-10-25T10:00:00Z");

  it("maps places and keeps the page token and fetch time", () => {
    const page = parseTextSearchResponse(
      {
        places: [
          {
            id: "p1",
            displayName: { text: "Butt Karahi", languageCode: "en" },
            formattedAddress: "F-7 Markaz, Islamabad",
            location: { latitude: 33.72, longitude: 73.05 },
            primaryType: "restaurant",
          },
          { id: "p2", displayName: { text: "No location" } },
        ],
        nextPageToken: "tok-2",
      },
      at,
    );
    expect(page.places).toEqual([
      {
        googlePlaceId: "p1",
        displayName: "Butt Karahi",
        formattedAddress: "F-7 Markaz, Islamabad",
        lat: 33.72,
        lng: 73.05,
        primaryType: "restaurant",
      },
    ]);
    expect(page.withoutLocation).toBe(1);
    expect(page.nextPageToken).toBe("tok-2");
    expect(page.fetchedAt).toBe(at);
  });

  it("treats an empty response as no results and no next page", () => {
    expect(parseTextSearchResponse({}, at)).toMatchObject({ places: [], nextPageToken: undefined });
  });
});
