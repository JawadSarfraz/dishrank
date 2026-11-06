// Zod schemas shared by server actions and /api/v1 route handlers (docs/06 "Zod schemas").
// Rules that need the database or the session (ownership, roles, rate limits) are enforced in
// services, not here.
import { z } from "zod";
import { safeNextPath } from "@/server/roles";
import { TRUST } from "@/server/services/ranking.constants";
import {
  CandidateSkipReason,
  FlagReason,
  RestaurantStatus,
  ReviewItemStatus,
  ReviewItemType,
} from "@/generated/prisma/enums";
import {
  blankToNull,
  blankToUndefined,
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

/** POST /api/v1/ratings. photoPath ownership (its Upload row, docs/06) is checked by the rating service. */
export const ratingInput = z.strictObject({
  restaurantId: id,
  dishId: id,
  score: z.int().min(1).max(10),
  taste: subScore,
  portion: subScore,
  value: subScore,
  comment: optionalText(280),
  /** On an edit: missing keeps the earlier photo, null removes it (its file is deleted). */
  photoPath: z
    .string()
    // dish-photos/<random>.<ext>; dish-photos/<userId>/<random>.<ext> was signed before Phase 6.
    .regex(/^dish-photos\/(?:[a-z0-9]+\/)?[a-z0-9]+\.(jpg|jpeg|webp)$/, "Invalid photo path")
    .nullable()
    .optional(),
});
export type RatingInput = z.infer<typeof ratingInput>;

/** "Rate the places you know": the places of one dish in one city. */
export const quickRatePlacesInput = z.strictObject({ city: slug, dish: slug });

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

/** POST /api/v1/reports: "Report a problem" on a restaurant page (a FLAG review item). */
export const REPORT_REASONS = ["CLOSED", "WRONG_LOCATION", "WRONG_DISH", "OTHER"] as const;
export const reportInput = z.strictObject({
  restaurantId: id,
  reason: z.enum(REPORT_REASONS),
  /** The dish a WRONG_DISH report is about. */
  dishId: id.optional(),
  note: optionalText(280),
});
export type ReportInput = z.infer<typeof reportInput>;

/** POST /api/v1/disputes: the /dispute form; anyone may send one. */
export const disputeInput = z.strictObject({
  message: text(1000, 10),
  /** How to reach the sender with the answer (optional). */
  contact: optionalText(200),
  /** The page the dispute is about. */
  page: optionalText(300),
});
export type DisputeInput = z.infer<typeof disputeInput>;

/** POST /api/v1/owner/claims. */
export const claimInput = z.strictObject({
  restaurantId: id,
  phone,
  proofNote: text(500),
});
export type ClaimInput = z.infer<typeof claimInput>;

/** POST /api/v1/uploads/sign: the client re-encodes to JPEG or WebP before upload (docs/06). */
export const uploadSignInput = z
  .strictObject({
    kind: z.enum(["dish-photo", "menu"]),
    contentType: z.enum(["image/jpeg", "image/webp"]),
    sizeBytes: z
      .int()
      .min(1)
      .max(5 * 1024 * 1024),
    /** Menus only (docs/07 §3): the restaurant whose menu this is. */
    restaurantId: id.optional(),
  })
  .refine((u) => (u.kind === "menu") === (u.restaurantId !== undefined), {
    message: "restaurantId goes with a menu photo, and only with one",
    path: ["restaurantId"],
  });
export type UploadSignInput = z.infer<typeof uploadSignInput>;

/** "Delete my account" on /me: the user types DELETE to confirm (Phase 6). */
export const accountDeleteInput = z.strictObject({ confirm: z.literal("DELETE") });
export type AccountDeleteInput = z.infer<typeof accountDeleteInput>;

/** An owner's change to one dish row of their restaurant (docs/07 §4, Phase 6). */
export const ownerDishInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("confirm") }),
  z.strictObject({ action: z.literal("remove"), reason: optionalText(280) }),
  z.strictObject({
    action: z.literal("edit"),
    menuName: z.preprocess(blankToNull, text(120).nullable()),
    price: z.preprocess(blankToNull, z.coerce.number().int().min(1).max(1_000_000).nullable()),
  }),
]);
export type OwnerDishInput = z.infer<typeof ownerDishInput>;

/** POST /api/v1/events: a ranking page reports one view (city and dish only, Phase 6). */
export const rankingViewInput = z.strictObject({
  name: z.literal("ranking_view"),
  city: slug,
  dish: slug,
});
export type RankingViewInput = z.infer<typeof rankingViewInput>;

/** A menu photo the browser uploaded with a signed URL (docs/07 §3) → MenuUpload PENDING. */
export const menuUploadInput = z.strictObject({ restaurantId: id, path: z.string().max(300) });
export type MenuUploadInput = z.infer<typeof menuUploadInput>;

/** /admin/menus: one status at a time, newest first. */
export const menuUploadsQuery = z.object({
  status: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["PENDING", "PARSED", "FAILED", "REVIEWED"]).default("PENDING"),
  ),
  cursor: optionalQuery(id),
});
export type MenuUploadsQuery = z.infer<typeof menuUploadsQuery>;

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

/** The panel flag; never accepted from any non-admin input (docs/09 Prompt 4). */
export const adminPanelInput = z.strictObject({ isPanel: z.boolean() });

/** A trust score an admin sets by hand (docs/04 trust range), or null to return to the table. */
export const adminTrustInput = z.strictObject({
  trustOverride: z.number().min(TRUST.min).max(TRUST.max).nullable(),
});

/** PATCH /api/v1/admin/users/:id: one change per request, the panel flag or the trust override. */
export const adminUserUpdateInput = z.union([adminPanelInput, adminTrustInput]);
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateInput>;

/** /admin/rankings "Launch city": sets City.launchedAt once (docs/06 admin cities launch). */
export const cityLaunchInput = z.strictObject({ city: slug });
export type CityLaunchInput = z.infer<typeof cityLaunchInput>;

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

/** A panel invite link's token: 256 random bits, base64url. */
export const panelInviteToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid invite link");

/** /admin/users: a new panel invite link; the defaults (30 uses, 14 days) live in the service. */
export const panelInviteCreateInput = z.strictObject({
  label: text(80),
  maxUses: z.int().min(1).max(500).optional(),
  expiresInDays: z.int().min(1).max(90).optional(),
  /** Opened after joining, e.g. a dish's quick rate: /islamabad/best-zinger-burger?rate=1. */
  next: z
    .string()
    .trim()
    .refine(
      (value) => safeNextPath(value) !== null,
      "Use a path on this site, such as /islamabad/best-pizza?rate=1",
    )
    .optional(),
});
export type PanelInviteCreateInput = z.infer<typeof panelInviteCreateInput>;

/** /admin/import/auto-list Apply: how many restaurants this request may create. */
export const autoListApplyInput = z.strictObject({ limit: z.int().min(1).max(200).optional() });
export type AutoListApplyInput = z.infer<typeof autoListApplyInput>;

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
    // Null: Overture had none for an auto-listed place, and an admin need not invent one to fix a name.
    address: text(300).nullable(),
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

/**
 * "Remove owner" on /admin/restaurants: `ownerId` is the owner the page showed (another one by now
 * answers ITEM_CHANGED), and the reason is required (it is logged).
 */
export const ownerRemoveInput = z.strictObject({
  ownerId: id,
  reason: z.preprocess(
    blankToUndefined,
    z.string({ error: "Say why the owner is removed" }).trim().min(1).max(500),
  ),
});
export type OwnerRemoveInput = z.infer<typeof ownerRemoveInput>;

/** PATCH /api/v1/admin/restaurants/:id { mergeIntoId }: this restaurant becomes a duplicate of that one. */
export const restaurantMergeInput = z.strictObject({ mergeIntoId: id });
export type RestaurantMergeInput = z.infer<typeof restaurantMergeInput>;

/** /admin/restaurants list filters (query string). */
export const adminRestaurantListQuery = z.object({
  q: optionalQuery(z.string().trim().max(80)),
  city: optionalQuery(slug),
  status: optionalQuery(z.enum(RestaurantStatus)),
  check: optionalQuery(z.literal("auto-unchecked")),
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
