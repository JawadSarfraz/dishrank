// "Report a problem" on restaurant pages and the /dispute form (docs/01 D7, D8). Both become FLAG
// review items for /admin/review; nothing changes on the public pages until an admin acts.
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { createReviewItem } from "@/server/repositories/moderation.repo";
import { findRestaurantById } from "@/server/repositories/restaurant.repo";
import { findDishById } from "@/server/repositories/taxonomy.repo";
import { findRater } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { DisputeInput, ReportInput } from "@/server/validation";

export async function reportProblem(
  actor: SessionUser | null,
  input: ReportInput,
  now: Date = new Date(),
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  const rater = await findRater(user.id);
  if (!rater || rater.bannedAt)
    throw new AppError("USER_BANNED", "This account cannot report", 403);
  const restaurant = await findRestaurantById(input.restaurantId);
  if (!restaurant || restaurant.status === "DUPLICATE") {
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  }
  const dish = input.dishId ? await findDishById(input.dishId) : null;
  if (input.dishId && !dish) throw new AppError("DISH_NOT_FOUND", "Pick a dish from the list", 404);
  await assertRateLimit(`user:${user.id}:flag`, RATE_LIMITS.flag, now);
  const item = await createReviewItem({
    type: "FLAG",
    restaurantId: restaurant.id,
    dishId: dish?.id ?? null,
    createdByUserId: user.id,
    payload: {
      kind: "report",
      restaurantId: restaurant.id,
      reason: input.reason,
      dishId: dish?.id ?? null,
      note: input.note ?? null,
    },
  });
  logEvent("report.create", { userId: user.id, entityId: item.id, reason: input.reason });
  return { id: item.id };
}

/**
 * A dispute from anyone, signed in or not (docs/01 trust rules: "anyone can dispute"); limited per
 * IP. It goes to the review queue only.
 */
// DECISION-PENDING: no e-mail provider is configured, so ADMIN_EMAIL is not notified; admins see disputes on /admin/review.
export async function fileDispute(
  actor: SessionUser | null,
  input: DisputeInput,
  ctx: { ipHash: string; now?: Date },
) {
  await assertRateLimit(`ip:${ctx.ipHash}:dispute`, RATE_LIMITS.dispute, ctx.now ?? new Date());
  const item = await createReviewItem({
    type: "FLAG",
    createdByUserId: actor?.id ?? null,
    payload: {
      kind: "dispute",
      message: input.message,
      contact: input.contact ?? null,
      page: input.page ?? null,
    },
  });
  logEvent("dispute.create", { userId: actor?.id ?? null, entityId: item.id });
  return { id: item.id };
}
