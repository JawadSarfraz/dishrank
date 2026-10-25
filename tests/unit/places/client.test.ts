import { describe, expect, it } from "vitest";
import { PlacesApiError, PlacesBudgetError, createPlacesClient } from "@/server/places";
import { fakeFetch, googleError, jsonResponse } from "./fake-fetch";

const KEY = "test-key-not-real";
const search = {
  textQuery: "Chai Blue Area Islamabad",
  restriction: { low: { lat: 33.69, lng: 73.04 }, high: { lat: 33.74, lng: 73.1 } },
};
const onePlace = {
  places: [
    {
      id: "p1",
      displayName: { text: "Fixture Chai Stop" },
      formattedAddress: "Fixture Arcade",
      location: { latitude: 33.71, longitude: 73.07 },
    },
  ],
};

function client(queue: Array<Response | Error>, maxCalls?: number) {
  const fake = fakeFetch(queue);
  const sleeps: number[] = [];
  const places = createPlacesClient({
    apiKey: KEY,
    maxCalls,
    fetch: fake.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { places, requests: fake.requests, sleeps };
}

describe("Places client", () => {
  it("retries 429 with backoff and counts every request", async () => {
    const { places, sleeps } = client([
      googleError(429, "RESOURCE_EXHAUSTED", "Quota exceeded"),
      jsonResponse(200, onePlace),
    ]);
    const page = await places.textSearch(search);
    expect(page.places.map((p) => p.googlePlaceId)).toEqual(["p1"]);
    expect(places.calls).toBe(2);
    expect(sleeps).toHaveLength(1);
  });

  it("gives up on 5xx after 3 attempts; describe() carries only the status codes", async () => {
    const { places, sleeps } = client([
      googleError(503, "UNAVAILABLE", "Try again"),
      googleError(503, "UNAVAILABLE", "Try again"),
      googleError(503, "UNAVAILABLE", "Try again"),
    ]);
    const error = await places.textSearch(search).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlacesApiError);
    expect((error as PlacesApiError).describe()).toBe("503 UNAVAILABLE");
    expect((error as PlacesApiError).message).not.toContain("Try again"); // Google's text is never kept
    expect(places.calls).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]!); // exponential
  });

  it("does not retry other 4xx errors, and the error never carries the key", async () => {
    const { places } = client([googleError(400, "INVALID_ARGUMENT", "Invalid pageToken")]);
    const error = (await places.textSearch(search).catch((e: unknown) => e)) as PlacesApiError;
    expect(error.describe()).toBe("400 INVALID_ARGUMENT");
    expect(JSON.stringify(error) + error.describe() + error.message).not.toContain(KEY);
    expect(error.message).not.toContain("Invalid pageToken"); // Google's error text is never kept
    expect(places.calls).toBe(1);
  });

  it("gives up on a hung request after the timeout instead of waiting for the function limit", async () => {
    const hanging = (async (_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)),
      )) as typeof fetch;
    const places = createPlacesClient({
      apiKey: KEY,
      fetch: hanging,
      timeoutMs: 5,
      sleep: async () => {},
    });
    const error = (await places.textSearch(search).catch((e: unknown) => e)) as PlacesApiError;
    expect(error.describe()).toBe("0 NETWORK_ERROR");
    expect(places.calls).toBe(3);
  });

  it("retries a network failure", async () => {
    const { places } = client([new TypeError("fetch failed"), jsonResponse(200, onePlace)]);
    expect((await places.textSearch(search)).places).toHaveLength(1);
    expect(places.calls).toBe(2);
  });

  it("refuses the request that would go over the call budget, before sending it", async () => {
    const { places, requests } = client(
      [jsonResponse(200, { ...onePlace, nextPageToken: "t2" }), jsonResponse(200, onePlace)],
      2,
    );
    await places.textSearch(search);
    await places.textSearch({ ...search, pageToken: "t2" });
    await expect(places.textSearch({ ...search, pageToken: "t3" })).rejects.toBeInstanceOf(
      PlacesBudgetError,
    );
    expect(requests).toHaveLength(2);
    expect(places.calls).toBe(2);
  });

  it("sends the planning search with the ids-only mask and returns ids only", async () => {
    const { places, requests } = client([jsonResponse(200, onePlace)]);
    const page = await places.textSearchIds(search);
    expect(page.placeIds).toEqual(["p1"]);
    expect(requests[0]?.init.headers).toMatchObject({
      "X-Goog-FieldMask": "places.id,nextPageToken",
    });
    expect(JSON.stringify(page)).not.toContain("Fixture Chai Stop");
  });

  it("returns NOT_FOUND from Place Details as a result without Google's text", async () => {
    const { places } = client([googleError(404, "NOT_FOUND", "Place ID is no longer valid")]);
    expect(await places.placeDetails("old-id")).toEqual({ kind: "not_found" });
    expect(places.calls).toBe(1);
  });

  it("reads the location from Place Details", async () => {
    const { places } = client([
      jsonResponse(200, { location: { latitude: 33.7, longitude: 73.1 } }),
    ]);
    expect(await places.placeDetails("p1")).toMatchObject({ kind: "ok", lat: 33.7, lng: 73.1 });
  });

  it("summarises a non-JSON error body by HTTP status", async () => {
    const { places } = client([new Response("<html>bad gateway</html>", { status: 400 })]);
    const error = (await places.placeDetails("p1").catch((e: unknown) => e)) as PlacesApiError;
    expect(error.describe()).toBe("400 HTTP_400");
  });

  it("refuses to start without an API key", () => {
    expect(() => createPlacesClient({ apiKey: "" })).toThrow(/GOOGLE_PLACES_API_KEY/);
  });
});
