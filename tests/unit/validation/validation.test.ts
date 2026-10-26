// The input rules that protect data and roles: rating bounds and photo paths, nothing a client may
// set (role, city, location, source), safe websites, review actions per type, the error shape.
import { describe, expect, it } from "vitest";
import { ReviewItemType } from "@/generated/prisma/enums";
import { AppError } from "@/server/errors";
import {
  adminRestaurantInput,
  candidateCreateInput,
  flagInput,
  isReviewActionAllowed,
  parseInput,
  ratingInput,
  REVIEW_ACTIONS,
  reviewResolveInput,
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
});

describe("what a client can never set", () => {
  const restaurant = { name: "Butt Karahi", areaId: did, address: "F-7 Markaz" };
  it("a restaurant's city comes from its area; websites are http(s) only", () => {
    expect(ok(adminRestaurantInput, restaurant)).toBe(true);
    expect(ok(adminRestaurantInput, { ...restaurant, cityId: rid })).toBe(false);
    expect(ok(adminRestaurantInput, { ...restaurant, website: "javascript:alert(1)" })).toBe(false);
  });
  it("Create on /admin/import never takes a location or a source (they come from Overture)", () => {
    const form = { candidateId: rid, ...restaurant };
    expect(ok(candidateCreateInput, { ...form, dishSlugs: ["chicken-karahi"] })).toBe(true);
    expect(ok(candidateCreateInput, { ...form, lat: 33.7, lng: 73.0 })).toBe(false);
    expect(ok(candidateCreateInput, { ...form, source: "MANUAL" })).toBe(false);
  });
});

describe("review decisions", () => {
  it("every item type has its actions; unknown actions and missing payloads are refused", () => {
    expect(Object.keys(REVIEW_ACTIONS).sort()).toEqual(Object.values(ReviewItemType).sort());
    expect(isReviewActionAllowed("FLAG", "uphold")).toBe(true);
    expect(isReviewActionAllowed("FLAG", "merge")).toBe(false);
    expect(ok(reviewResolveInput, { action: "delete_everything" })).toBe(false);
    expect(ok(reviewResolveInput, { action: "assign_dish" })).toBe(false);
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
