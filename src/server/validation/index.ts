// Zod schemas shared by server actions and /api/v1 route handlers (docs/06 "Zod schemas").
// Rules that need the database or the session (ownership, roles, rate limits) are enforced in
// services, not here.
import { z } from "zod";
import {
  CandidateSkipReason,
  FlagReason,
  RestaurantStatus,
  ReviewItemStatus,
  ReviewItemType,
} from "@/generated/prisma/enums";
import {
  id,
  latitude,
  longitude,
  optionalQuery,
  optionalText,
  parseInput,
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
    /** The restaurant the diner was rating when the dish was missing (docs/07 §6 payload). */
    restaurantId: id.optional(),
    note: optionalText(280),
  }),
  z.strictObject({
    type: z.literal("RESTAURANT"),
    name: text(120, 2),
    cityId: id, // docs/07: a restaurant proposal is always for a city
    areaId: id, // the /rate "Can't find it?" form asks for the area
    note: optionalText(280),
  }),
]);
export type ProposalInput = z.infer<typeof proposalInput>;

/** POST /api/v1/location-observations: a panel member at a restaurant shares the browser's location. */
export const locationObservationInput = z.strictObject({
  restaurantId: id,
  lat: latitude,
  lng: longitude,
  /** Browser accuracy radius in metres; worse than 50 m is never saved (docs/07 §7). */
  accuracyM: z.number().positive().max(50, "Location not accurate enough (50 m or better)"),
});
export type LocationObservationInput = z.infer<typeof locationObservationInput>;

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

/** GET /api/v1/me/ratings query: newest first, cursor = the last id of the previous page. */
export const meRatingsQuery = z.object({
  cursor: optionalQuery(id),
  limit: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(100).default(50),
  ),
});
export type MeRatingsQuery = z.infer<typeof meRatingsQuery>;

/** GET /api/v1/dishes query (docs/06): q searches every spelling in DishAlias (docs/05). */
export const dishSearchQuery = z.object({
  city: optionalQuery(slug),
  q: optionalQuery(z.string().trim().max(80)),
  launchOnly: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  ),
});
export type DishSearchQuery = z.infer<typeof dishSearchQuery>;

/** /admin/users list (query string). */
export const adminUserListQuery = z.object({
  q: optionalQuery(z.string().trim().max(120)),
  panel: optionalQuery(z.enum(["only"])),
  page: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(10_000).default(1),
  ),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuery>;

/**
 * PATCH /api/v1/admin/users/:id. Phase 3 changes only the panel flag; the flag is never accepted
 * from any non-admin input (docs/09 Prompt 4).
 */
export const adminUserUpdateInput = z.strictObject({ isPanel: z.boolean() });
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateInput>;

/** GET /api/v1/admin/review-queue query. */
export const reviewQueueQuery = z.object({
  type: optionalQuery(z.enum(ReviewItemType)),
  status: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(ReviewItemStatus).default("OPEN"),
  ),
  cursor: optionalQuery(id),
  limit: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(100).default(50),
  ),
});
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuery>;

/** GET /api/v1/restaurants/search query. */
export const restaurantSearchQuery = z.object({
  city: slug,
  q: text(80),
});
export type RestaurantSearchQuery = z.infer<typeof restaurantSearchQuery>;

/** Other names a restaurant goes by ("but karahi"); part of its search text (docs/05). */
const restaurantAliases = z.array(text(120)).max(20);

const bothOrNeither = (r: { lat?: number | null; lng?: number | null }) =>
  (r.lat === undefined || r.lat === null) === (r.lng === undefined || r.lng === null);

/** The restaurant's own site or page: http(s) only. */
const website = z.url({ protocol: /^https?$/, error: "Invalid website" }).max(300);

/** Dishes an admin ticks: each becomes a CANDIDATE RestaurantDish (docs/07 §2). */
const dishSlugs = z.array(slug).max(40);

/** Fields an admin types or confirms (prefilled from Overture on /admin/import, docs/07 §2). */
const restaurantFields = {
  name: text(120),
  areaId: id,
  address: text(300),
  phone: optionalQuery(phone),
  website: optionalQuery(website),
  priceBand: z.int().min(1).max(4).optional(),
  aliases: restaurantAliases.optional(),
  dishSlugs: dishSlugs.optional(),
};

/**
 * POST /api/v1/admin/restaurants and /admin/restaurants/new: a restaurant added by hand. The city
 * is the area's city; a location is optional.
 */
export const adminRestaurantInput = z
  .strictObject({ ...restaurantFields, lat: latitude.optional(), lng: longitude.optional() })
  .refine(bothOrNeither, { message: "lat and lng go together", path: ["lat"] });
export type AdminRestaurantInput = z.infer<typeof adminRestaurantInput>;

/** /admin/import Create: the form for one Overture candidate; its location comes from Overture. */
export const candidateCreateInput = z.strictObject({ candidateId: id, ...restaurantFields });
export type CandidateCreateInput = z.infer<typeof candidateCreateInput>;

/** /admin/import Link: this candidate is that restaurant. */
export const candidateLinkInput = z.strictObject({ candidateId: id, restaurantId: id });
export type CandidateLinkInput = z.infer<typeof candidateLinkInput>;

/** /admin/import Skip, with an optional reason. */
export const candidateSkipInput = z.strictObject({
  candidateId: id,
  reason: z.enum(CandidateSkipReason).optional(),
});
export type CandidateSkipInput = z.infer<typeof candidateSkipInput>;

/** /admin/import Reopen: a skipped candidate goes back to the list. */
export const candidateReopenInput = z.strictObject({ candidateId: id });

/** /admin/import query string: city, area ("none" = no suggested area) and which candidates. */
export const importQueueQuery = z.object({
  city: optionalQuery(slug),
  area: optionalQuery(z.union([z.literal("none"), slug])),
  show: optionalQuery(z.enum(["new", "skipped", "done"])),
});
export type ImportQueueQuery = z.infer<typeof importQueueQuery>;

/** PATCH /api/v1/admin/restaurants/:id (edit). The slug never changes; null clears the location. */
export const adminRestaurantUpdateInput = z
  .strictObject({
    name: text(120),
    areaId: id,
    address: text(300),
    phone: phone.nullable(),
    website: website.nullable(),
    priceBand: z.int().min(1).max(4).nullable(),
    aliases: restaurantAliases,
    lat: latitude.nullable().optional(),
    lng: longitude.nullable().optional(),
  })
  .refine(bothOrNeither, { message: "lat and lng go together", path: ["lat"] });
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
]);
export type ReviewResolveInput = z.infer<typeof reviewResolveInput>;
export type ReviewAction = ReviewResolveInput["action"];

/** The item as the admin saw it: `fingerprint` from GET /api/v1/admin/review-queue (docs/06). */
export const reviewFingerprint = z.string().regex(/^[a-f0-9]{32}$/, "Invalid fingerprint");

/** The resolve body `{ action, payload?, fingerprint? }`: the decision and what the admin saw. */
export function parseReviewResolveBody(body: unknown) {
  const { fingerprint, ...decision } =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  return {
    input: parseInput(reviewResolveInput, decision),
    fingerprint: fingerprint === undefined ? undefined : parseInput(reviewFingerprint, fingerprint),
  };
}

/** Which actions apply to which review item type (docs/07 §6); the review service enforces this. */
export const REVIEW_ACTIONS: Record<ReviewItemType, readonly ReviewAction[]> = {
  UNMATCHED_MENU_ITEM: ["assign_dish", "ignore", "create_dish_and_assign"],
  DISH_PROPOSAL: ["create_dish", "map_to_dish", "reject"],
  RESTAURANT_PROPOSAL: ["create_restaurant", "link_restaurant", "reject"],
  FLAG: ["uphold", "dismiss"],
  SUSPICIOUS_RATINGS: ["release", "hide", "ban_users"],
  OWNER_CLAIM: ["approve", "reject"],
  DUPLICATE_RESTAURANT: ["merge", "keep_both"],
  // A panel member's on-site location for a restaurant without one, or far from it (docs/07 §7).
  LOCATION_SUGGESTION: ["approve", "reject"],
};

export function isReviewActionAllowed(type: ReviewItemType, action: ReviewAction): boolean {
  return REVIEW_ACTIONS[type].includes(action);
}
