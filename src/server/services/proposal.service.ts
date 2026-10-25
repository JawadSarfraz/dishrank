// POST /api/v1/proposals (docs/06, docs/07 §6): a diner suggests a dish that is not in the list, or a
// restaurant we do not have. Free text only ever becomes a review item for an admin, never a dish or
// a restaurant (CLAUDE.md rules 2 and 5).
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { findAreaById } from "@/server/repositories/geo.repo";
import { createReviewItem, listOpenItemsCreatedBy } from "@/server/repositories/moderation.repo";
import { findRestaurantById } from "@/server/repositories/restaurant.repo";
import { findRater } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { ProposalInput } from "@/server/validation";
import { cleanText } from "./matching/normalize";

export async function propose(
  actor: SessionUser | null,
  input: ProposalInput,
  now: Date = new Date(),
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  const rater = await findRater(user.id);
  if (!rater || rater.bannedAt)
    throw new AppError("USER_BANNED", "This account cannot suggest", 403);

  let payload: Record<string, string | null>;
  let restaurantId: string | null = null;
  if (input.type === "DISH") {
    if (input.restaurantId) {
      const restaurant = await findRestaurantById(input.restaurantId);
      if (!restaurant) throw new AppError("NOT_FOUND", "Restaurant not found", 404);
      restaurantId = restaurant.id;
    }
    payload = { name: input.name, note: input.note ?? null, restaurantId };
  } else {
    const area = await findAreaById(input.areaId);
    if (!area || area.cityId !== input.cityId) {
      throw new AppError("AREA_NOT_IN_CITY", "The area does not belong to this city", 400);
    }
    payload = { name: input.name, cityId: input.cityId, areaId: area.id, note: input.note ?? null };
  }

  // The same open suggestion from the same person is not filed twice.
  const type = input.type === "DISH" ? "DISH_PROPOSAL" : "RESTAURANT_PROPOSAL";
  const mine = await listOpenItemsCreatedBy(type, user.id);
  const same = mine.find((item) => {
    const p = item.payload as { name?: string; restaurantId?: string | null; areaId?: string };
    return (
      cleanText(p.name ?? "") === cleanText(input.name) &&
      (input.type === "DISH"
        ? (p.restaurantId ?? null) === restaurantId
        : p.areaId === payload.areaId)
    );
  });
  if (same) return { id: same.id, type, duplicate: true };

  await assertRateLimit(`user:${user.id}:proposal`, RATE_LIMITS.proposal, now);
  const item = await createReviewItem({ type, payload, restaurantId, createdByUserId: user.id });
  logEvent("proposal.create", { userId: user.id, entityId: item.id, type });
  return { id: item.id, type, duplicate: false };
}
