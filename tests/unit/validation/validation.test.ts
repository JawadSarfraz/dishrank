import { describe, expect, it } from "vitest";
import { ReviewItemType } from "@/generated/prisma/enums";
import { AppError } from "@/server/errors";
import {
  adminRestaurantInput,
  adminRestaurantUpdateInput,
  candidateCreateInput,
  candidateLinkInput,
  candidateSkipInput,
  claimInput,
  flagInput,
  importQueueQuery,
  isReviewActionAllowed,
  parseInput,
  proposalInput,
  rankingQuery,
  ratingInput,
  restaurantDishInput,
  restaurantSearchQuery,
  REVIEW_ACTIONS,
  reviewResolveInput,
  uploadSignInput,
} from "@/server/validation";

const rid = "cmabc123def456ghi789jkl0";
const did = "cmdish00000000000000000a";
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe("ratingInput", () => {
  const base = { restaurantId: rid, dishId: did, score: 8 };
  it("accepts the docs/06 example", () => {
    expect(
      ok(ratingInput, {
        ...base,
        taste: 4,
        portion: 3,
        value: 4,
        comment: "Best ginger in F-7",
        photoPath: "dish-photos/u123/abc.jpg",
      }),
    ).toBe(true);
  });
  it.each([
    [{ ...base, score: 0 }],
    [{ ...base, score: 11 }],
    [{ ...base, score: 7.5 }],
    [{ ...base, taste: 6 }],
    [{ ...base, comment: "x".repeat(281) }],
    [{ ...base, photoPath: "menus/u1/a.jpg" }],
    [{ ...base, photoPath: "dish-photos/../secret.jpg" }],
    [{ ...base, role: "ADMIN" }], // unknown keys are rejected
  ])("rejects %j", (input) => {
    expect(ok(ratingInput, input)).toBe(false);
  });
  it("treats a blank comment as no comment", () => {
    expect(ratingInput.parse({ ...base, comment: "   " }).comment).toBeUndefined();
  });
});

describe("restaurantDishInput, flagInput, claimInput, uploadSignInput", () => {
  it("restaurantDishInput", () => {
    expect(
      ok(restaurantDishInput, {
        restaurantId: rid,
        dishId: did,
        menuName: "Karahi Special",
        price: 2200,
      }),
    ).toBe(true);
    expect(ok(restaurantDishInput, { restaurantId: rid, dishId: did, price: -5 })).toBe(false);
  });
  it("flagInput uses the FlagReason enum", () => {
    expect(ok(flagInput, { restaurantDishId: rid, reason: "NOT_SERVED" })).toBe(true);
    expect(ok(flagInput, { restaurantDishId: rid, reason: "DIRTY_KITCHEN" })).toBe(false);
  });
  it("claimInput normalises the phone number and needs a proof note", () => {
    expect(
      claimInput.parse({ restaurantId: rid, phone: "+92 300-1234567", proofNote: "Call the shop" })
        .phone,
    ).toBe("+923001234567");
    expect(ok(claimInput, { restaurantId: rid, phone: "12", proofNote: "x" })).toBe(false);
    expect(ok(claimInput, { restaurantId: rid, phone: "03001234567", proofNote: "  " })).toBe(
      false,
    );
  });
  it("uploadSignInput allows JPEG/WebP up to 5 MB", () => {
    expect(
      ok(uploadSignInput, {
        kind: "dish-photo",
        contentType: "image/webp",
        sizeBytes: 5 * 1024 * 1024,
      }),
    ).toBe(true);
    expect(ok(uploadSignInput, { kind: "menu", contentType: "image/png", sizeBytes: 1000 })).toBe(
      false,
    );
    expect(
      ok(uploadSignInput, {
        kind: "menu",
        contentType: "image/jpeg",
        sizeBytes: 5 * 1024 * 1024 + 1,
      }),
    ).toBe(false);
  });
});

describe("proposalInput", () => {
  it("accepts dish and restaurant proposals", () => {
    expect(ok(proposalInput, { type: "DISH", name: "Peshawari Qehwa" })).toBe(true);
    expect(
      ok(proposalInput, { type: "RESTAURANT", name: "Butt Karahi", cityId: rid, areaId: did }),
    ).toBe(true);
    expect(ok(proposalInput, { type: "DISH", name: "Lahori Fish", restaurantId: rid })).toBe(true);
  });
  it("needs a city and an area for restaurant proposals and a real name", () => {
    expect(ok(proposalInput, { type: "RESTAURANT", name: "Butt Karahi" })).toBe(false);
    expect(ok(proposalInput, { type: "RESTAURANT", name: "Butt Karahi", cityId: rid })).toBe(false);
    expect(ok(proposalInput, { type: "DISH", name: "x" })).toBe(false);
    expect(ok(proposalInput, { type: "SHOP", name: "Butt Karahi" })).toBe(false);
  });
});

describe("rankingQuery (query strings)", () => {
  it("applies defaults and treats blanks as missing", () => {
    expect(
      rankingQuery.parse({ city: "islamabad", dish: "chicken-karahi", area: "", sort: "" }),
    ).toEqual({
      city: "islamabad",
      dish: "chicken-karahi",
      sort: "score",
      limit: 100,
    });
  });
  it("coerces numbers and checks ranges", () => {
    const q = rankingQuery.parse({
      city: "islamabad",
      dish: "pizza",
      lat: "33.7",
      lng: "73.05",
      radiusKm: "3",
      limit: "20",
    });
    expect(q).toMatchObject({ lat: 33.7, lng: 73.05, radiusKm: 3, limit: 20 });
    expect(ok(rankingQuery, { city: "islamabad", dish: "pizza", lat: "91", lng: "73" })).toBe(
      false,
    );
    expect(ok(rankingQuery, { city: "islamabad", dish: "pizza", limit: "500" })).toBe(false);
  });
  it("needs lat and lng together, and both for radiusKm", () => {
    expect(ok(rankingQuery, { city: "islamabad", dish: "pizza", lat: "33.7" })).toBe(false);
    expect(ok(rankingQuery, { city: "islamabad", dish: "pizza", radiusKm: "2" })).toBe(false);
  });
  it("rejects a bad slug or sort", () => {
    expect(ok(rankingQuery, { city: "Islamabad", dish: "pizza" })).toBe(false);
    expect(ok(rankingQuery, { city: "islamabad", dish: "pizza", sort: "distance" })).toBe(false);
  });
});

describe("restaurantSearchQuery", () => {
  it("needs a city slug and a short query", () => {
    expect(restaurantSearchQuery.parse({ city: "rawalpindi", q: "  but karahi " }).q).toBe(
      "but karahi",
    );
    expect(ok(restaurantSearchQuery, { city: "rawalpindi", q: "" })).toBe(false);
  });
});

describe("adminRestaurantInput", () => {
  const base = {
    name: "Butt Karahi",
    areaId: did,
    address: "F-7 Markaz",
    lat: 33.72,
    lng: 73.05,
  };
  it("accepts a hand-entered restaurant", () => {
    expect(ok(adminRestaurantInput, { ...base, priceBand: 2, phone: "051 1234567" })).toBe(true);
  });
  it("takes the city from the area, never from the client", () => {
    expect(ok(adminRestaurantInput, { ...base, cityId: rid })).toBe(false);
  });
  it("makes the location optional, but lat and lng go together", () => {
    const noLocation = { name: base.name, areaId: base.areaId, address: base.address };
    const edit = { ...noLocation, phone: null, website: null, priceBand: null, aliases: [] };
    expect(ok(adminRestaurantInput, noLocation)).toBe(true);
    expect(ok(adminRestaurantInput, { ...noLocation, lat: 33.72 })).toBe(false);
    expect(ok(adminRestaurantUpdateInput, { ...edit, lat: null, lng: null })).toBe(true);
    expect(ok(adminRestaurantUpdateInput, { ...edit, lat: 33.72, lng: null })).toBe(false);
  });
  it("rejects a price band outside 1..4", () => {
    expect(ok(adminRestaurantInput, { ...base, priceBand: 5 })).toBe(false);
  });
  it("takes an http(s) website, blank phone and website as missing, and dish slugs", () => {
    const parsed = adminRestaurantInput.parse({
      ...base,
      phone: " ",
      website: "",
      dishSlugs: ["chicken-karahi", "chai"],
    });
    expect(parsed).toMatchObject({ phone: undefined, website: undefined });
    expect(ok(adminRestaurantInput, { ...base, website: "https://butt-karahi.example/menu" })).toBe(
      true,
    );
    expect(ok(adminRestaurantInput, { ...base, website: "javascript:alert(1)" })).toBe(false);
    expect(ok(adminRestaurantInput, { ...base, website: "ftp://files.example" })).toBe(false);
    expect(ok(adminRestaurantInput, { ...base, dishSlugs: ["Not A Slug"] })).toBe(false);
  });
});

describe("/admin/import inputs", () => {
  const form = { candidateId: rid, name: "Butt Karahi", areaId: did, address: "F-7 Markaz" };
  it("Create takes the confirmed form but never a location (it comes from Overture)", () => {
    expect(ok(candidateCreateInput, { ...form, dishSlugs: ["chicken-karahi"] })).toBe(true);
    expect(ok(candidateCreateInput, { ...form, lat: 33.7, lng: 73.0 })).toBe(false);
    expect(ok(candidateCreateInput, { ...form, source: "MANUAL" })).toBe(false);
  });
  it("Link needs both ids; Skip takes one of three reasons or none", () => {
    expect(ok(candidateLinkInput, { candidateId: rid, restaurantId: did })).toBe(true);
    expect(ok(candidateLinkInput, { candidateId: rid })).toBe(false);
    expect(ok(candidateSkipInput, { candidateId: rid })).toBe(true);
    expect(ok(candidateSkipInput, { candidateId: rid, reason: "NOT_A_RESTAURANT" })).toBe(true);
    expect(ok(candidateSkipInput, { candidateId: rid, reason: "BORING" })).toBe(false);
  });
  it("reads the queue's query string; blank values mean the defaults", () => {
    expect(importQueueQuery.parse({ city: "islamabad", area: "none", show: "skipped" })).toEqual({
      city: "islamabad",
      area: "none",
      show: "skipped",
    });
    expect(importQueueQuery.parse({ city: "", area: "f-7" })).toEqual({
      city: undefined,
      area: "f-7",
      show: undefined,
    });
    expect(ok(importQueueQuery, { show: "everything" })).toBe(false);
  });
});

describe("reviewResolveInput", () => {
  it("parses actions with and without payloads", () => {
    expect(ok(reviewResolveInput, { action: "assign_dish", payload: { dishId: did } })).toBe(true);
    expect(ok(reviewResolveInput, { action: "ignore" })).toBe(true);
    expect(ok(reviewResolveInput, { action: "reject", payload: { reason: "Not a dish" } })).toBe(
      true,
    );
    expect(
      ok(reviewResolveInput, {
        action: "create_dish",
        payload: {
          dish: {
            slug: "peshawari-qehwa",
            name: "Peshawari Qehwa",
            categoryId: did,
            aliases: ["qehwa", "kahwa"],
          },
        },
      }),
    ).toBe(true);
  });
  it("rejects unknown actions and missing payloads", () => {
    expect(ok(reviewResolveInput, { action: "delete_everything" })).toBe(false);
    expect(ok(reviewResolveInput, { action: "assign_dish" })).toBe(false);
  });
  it("maps every review item type to its actions", () => {
    expect(Object.keys(REVIEW_ACTIONS).sort()).toEqual(Object.values(ReviewItemType).sort());
    expect(isReviewActionAllowed("FLAG", "uphold")).toBe(true);
    expect(isReviewActionAllowed("FLAG", "merge")).toBe(false);
  });
});

describe("parseInput", () => {
  it("throws AppError VALIDATION_FAILED (400) with per-field messages", () => {
    try {
      parseInput(flagInput, { restaurantDishId: "x", reason: "NOPE" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err).toMatchObject({ code: "VALIDATION_FAILED", status: 400 });
      expect(Object.keys((err.details as { fieldErrors: object }).fieldErrors).sort()).toEqual([
        "reason",
        "restaurantDishId",
      ]);
    }
  });
});
