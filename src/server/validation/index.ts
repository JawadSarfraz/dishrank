// Zod schemas shared by server actions and /api/v1 route handlers (docs/06 "Zod schemas").
// Rules that need the database or the session (ownership, roles, rate limits, the 30-day
// fetchedAt age) are enforced in services, not here.
import { z } from "zod";
import { FlagReason, RestaurantStatus, ReviewItemType } from "@/generated/prisma/enums";
import {
  googlePlaceId,
  id,
  latitude,
  longitude,
  optionalQuery,
  optionalText,
  phone,
  slug,
  text,
} from "./common";

export { parseInput } from "./common";

const subScore = z.int().min(1).max(5).optional();

/** POST /api/v1/ratings. photoPath ownership (dish-photos/<userId>/…) is checked by the rating service. */
export const ratingInput = z.strictObject({
  restaurantId: id,
  dishId: id,
  score: z.int().min(1).max(10),
  taste: subScore,
  portion: subScore,
  value: subScore,
  comment: optionalText(280),
  photoPath: z
    .string()
    .regex(/^dish-photos\/[a-z0-9]+\/[a-z0-9]+\.(jpg|jpeg|webp)$/, "Invalid photo path")
    .optional(),
});
export type RatingInput = z.infer<typeof ratingInput>;

/** POST /api/v1/restaurant-dishes (creates a CANDIDATE if absent). */
export const restaurantDishInput = z.strictObject({
  restaurantId: id,
  dishId: id,
  menuName: optionalText(120),
  price: z.int().min(1).max(1_000_000).optional(), // PKR
});
export type RestaurantDishInput = z.infer<typeof restaurantDishInput>;

/** POST /api/v1/flags. */
export const flagInput = z.strictObject({
  restaurantDishId: id,
  reason: z.enum(FlagReason),
  note: optionalText(280),
});
export type FlagInput = z.infer<typeof flagInput>;

/** POST /api/v1/proposals → ReviewItem DISH_PROPOSAL | RESTAURANT_PROPOSAL. Free text never creates a dish. */
export const proposalInput = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("DISH"),
    name: text(120, 2),
    cityId: id.optional(),
    areaId: id.optional(),
    note: optionalText(280),
  }),
  z.strictObject({
    type: z.literal("RESTAURANT"),
    name: text(120, 2),
    cityId: id, // docs/07: a restaurant proposal is always for a city
    areaId: id.optional(),
    note: optionalText(280),
  }),
]);
export type ProposalInput = z.infer<typeof proposalInput>;

/** POST /api/v1/owner/claims. */
export const claimInput = z.strictObject({
  restaurantId: id,
  phone,
  proofNote: text(500),
});
export type ClaimInput = z.infer<typeof claimInput>;

/** POST /api/v1/uploads/sign: the client re-encodes to JPEG or WebP before upload (docs/06). */
export const uploadSignInput = z.strictObject({
  kind: z.enum(["dish-photo", "menu"]),
  contentType: z.enum(["image/jpeg", "image/webp"]),
  sizeBytes: z
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
});
export type UploadSignInput = z.infer<typeof uploadSignInput>;

/** GET /api/v1/rankings query (all values arrive as strings). Ranks stay city-wide under any filter. */
export const rankingQuery = z
  .object({
    city: slug,
    dish: slug,
    area: optionalQuery(slug),
    sort: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.enum(["score", "votes", "price"]).default("score"),
    ),
    lat: optionalQuery(z.coerce.number().pipe(latitude)),
    lng: optionalQuery(z.coerce.number().pipe(longitude)),
    radiusKm: optionalQuery(z.coerce.number().positive().max(50)),
    limit: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().int().min(1).max(100).default(100),
    ),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    message: "lat and lng go together",
    path: ["lat"],
  })
  .refine((q) => q.radiusKm === undefined || q.lat !== undefined, {
    message: "radiusKm needs lat and lng",
    path: ["radiusKm"],
  });
export type RankingQuery = z.infer<typeof rankingQuery>;

/** GET /api/v1/restaurants/search query. */
export const restaurantSearchQuery = z.object({
  city: slug,
  q: text(80),
});
export type RestaurantSearchQuery = z.infer<typeof restaurantSearchQuery>;

/** Other names a restaurant goes by ("but karahi"); part of its search text (docs/05). */
const restaurantAliases = z.array(text(120)).max(20);

/** Fields an admin types or confirms for a restaurant. Name and address are our own record (docs/07 §1). */
const restaurantFields = {
  name: text(120),
  cityId: id,
  areaId: id,
  address: text(300),
  lat: latitude,
  lng: longitude,
  phone: phone.optional(),
  priceBand: z.int().min(1).max(4).optional(),
  aliases: restaurantAliases.optional(),
};

const isoDateTime = z.iso.datetime({ offset: true });

/**
 * POST /api/v1/admin/restaurants (create from an import row or by hand). With a googlePlaceId the
 * CSV fetchedAt is required, because googleSyncedAt = fetchedAt (docs/07 §2); the service rejects
 * rows older than 30 days.
 */
export const adminRestaurantInput = z
  .strictObject({
    ...restaurantFields,
    googlePlaceId: googlePlaceId.optional(),
    fetchedAt: isoDateTime.optional(),
  })
  .refine((r) => !r.googlePlaceId || r.fetchedAt, {
    message: "fetchedAt is required with a googlePlaceId",
    path: ["fetchedAt"],
  });
export type AdminRestaurantInput = z.infer<typeof adminRestaurantInput>;

/** /admin/import Create: the form the admin confirmed for one CSV row (docs/07 §2). */
export const importCreateInput = z.strictObject({
  ...restaurantFields,
  googlePlaceId,
  fetchedAt: isoDateTime,
  dishSlug: slug,
});
export type ImportCreateInput = z.infer<typeof importCreateInput>;

/** /admin/import Link: attach a CSV row's place and dish to an existing restaurant. */
export const importLinkInput = z.strictObject({
  restaurantId: id,
  googlePlaceId,
  lat: latitude,
  lng: longitude,
  fetchedAt: isoDateTime,
  dishSlug: slug,
});
export type ImportLinkInput = z.infer<typeof importLinkInput>;

/**
 * PATCH /api/v1/admin/restaurants/:id (edit). The slug never changes. lat/lng can be typed only for
 * a restaurant without a googlePlaceId: Google coordinates come from the CSV and the daily refresh.
 */
export const adminRestaurantUpdateInput = z.strictObject({
  name: text(120),
  areaId: id,
  address: text(300),
  phone: phone.nullable(),
  priceBand: z.int().min(1).max(4).nullable(),
  aliases: restaurantAliases,
  lat: latitude.nullable().optional(),
  lng: longitude.nullable().optional(),
});
export type AdminRestaurantUpdateInput = z.infer<typeof adminRestaurantUpdateInput>;

/** PATCH /api/v1/admin/restaurants/:id { status }. DUPLICATE is set only by a merge. */
export const restaurantStatusInput = z.strictObject({
  status: z.enum(["ACTIVE", "CLOSED", "HIDDEN"]),
});
export type RestaurantStatusInput = z.infer<typeof restaurantStatusInput>;

/** PATCH /api/v1/admin/restaurants/:id { mergeIntoId }: this restaurant becomes a duplicate of that one. */
export const restaurantMergeInput = z.strictObject({ mergeIntoId: id });
export type RestaurantMergeInput = z.infer<typeof restaurantMergeInput>;

/** /admin/restaurants list filters (query string). */
export const adminRestaurantListQuery = z.object({
  q: optionalQuery(z.string().trim().max(80)),
  city: optionalQuery(slug),
  status: optionalQuery(z.enum(RestaurantStatus)),
  page: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(10_000).default(1),
  ),
});
export type AdminRestaurantListQuery = z.infer<typeof adminRestaurantListQuery>;

/** A dish created by an admin from the review queue (aliases are normalised by the service). */
export const newDishInput = z.strictObject({
  slug,
  name: text(80),
  categoryId: id,
  aliases: z.array(text(80)).max(50).default([]),
});

const noPayload = z.strictObject({}).optional();
const reason = z.strictObject({ reason: optionalText(500) }).optional();

/** POST /api/v1/admin/review-queue/:id/resolve: `{ action, payload }` per docs/07 §6. */
export const reviewResolveInput = z.discriminatedUnion("action", [
  // UNMATCHED_MENU_ITEM
  z.strictObject({ action: z.literal("assign_dish"), payload: z.strictObject({ dishId: id }) }),
  z.strictObject({ action: z.literal("ignore"), payload: noPayload }),
  z.strictObject({
    action: z.literal("create_dish_and_assign"),
    payload: z.strictObject({ dish: newDishInput }),
  }),
  // DISH_PROPOSAL
  z.strictObject({
    action: z.literal("create_dish"),
    payload: z.strictObject({ dish: newDishInput }),
  }),
  z.strictObject({ action: z.literal("map_to_dish"), payload: z.strictObject({ dishId: id }) }),
  // RESTAURANT_PROPOSAL
  z.strictObject({
    action: z.literal("create_restaurant"),
    payload: z.strictObject({ restaurant: adminRestaurantInput }),
  }),
  z.strictObject({
    action: z.literal("link_restaurant"),
    payload: z.strictObject({ restaurantId: id }),
  }),
  // DISH_PROPOSAL, RESTAURANT_PROPOSAL, OWNER_CLAIM
  z.strictObject({ action: z.literal("reject"), payload: reason }),
  // FLAG
  z.strictObject({ action: z.literal("uphold"), payload: noPayload }),
  z.strictObject({ action: z.literal("dismiss"), payload: noPayload }),
  // SUSPICIOUS_RATINGS
  z.strictObject({ action: z.literal("release"), payload: noPayload }),
  z.strictObject({ action: z.literal("hide"), payload: noPayload }),
  z.strictObject({ action: z.literal("ban_users"), payload: noPayload }),
  // OWNER_CLAIM
  z.strictObject({ action: z.literal("approve"), payload: noPayload }),
  // DUPLICATE_RESTAURANT (merge B into A, docs/07 §2)
  z.strictObject({ action: z.literal("merge"), payload: noPayload }),
  z.strictObject({ action: z.literal("keep_both"), payload: noPayload }),
  // PLACE_REFRESH_FAILED
  z.strictObject({
    action: z.literal("relink"),
    payload: z.strictObject({
      googlePlaceId,
      lat: latitude,
      lng: longitude,
      fetchedAt: z.iso.datetime({ offset: true }),
    }),
  }),
  z.strictObject({ action: z.literal("mark_closed"), payload: noPayload }),
  z.strictObject({ action: z.literal("keep_without_coordinates"), payload: noPayload }),
]);
export type ReviewResolveInput = z.infer<typeof reviewResolveInput>;
export type ReviewAction = ReviewResolveInput["action"];

/** Which actions apply to which review item type (docs/07 §6); the review service enforces this. */
export const REVIEW_ACTIONS: Record<ReviewItemType, readonly ReviewAction[]> = {
  UNMATCHED_MENU_ITEM: ["assign_dish", "ignore", "create_dish_and_assign"],
  DISH_PROPOSAL: ["create_dish", "map_to_dish", "reject"],
  RESTAURANT_PROPOSAL: ["create_restaurant", "link_restaurant", "reject"],
  FLAG: ["uphold", "dismiss"],
  SUSPICIOUS_RATINGS: ["release", "hide", "ban_users"],
  OWNER_CLAIM: ["approve", "reject"],
  DUPLICATE_RESTAURANT: ["merge", "keep_both"],
  PLACE_REFRESH_FAILED: ["relink", "mark_closed", "keep_without_coordinates"],
};

export function isReviewActionAllowed(type: ReviewItemType, action: ReviewAction): boolean {
  return REVIEW_ACTIONS[type].includes(action);
}
