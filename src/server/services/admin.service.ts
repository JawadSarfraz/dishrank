import { countOpenReviewItems } from "@/server/repositories/moderation.repo";
import { listRecentJobRuns } from "@/server/repositories/ops.repo";
import { countNewCandidates } from "@/server/repositories/overture.repo";
import { countRestaurantsByStatus } from "@/server/repositories/restaurant.repo";
import { countUsersByRole } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import { RECOMPUTE_JOB } from "./ranking-nightly.service";
import { REVIEW_PAGE_TYPES } from "./review.service";

/** Admin home numbers. Checks the role itself, so a page that forgets its guard still gets FORBIDDEN. */
export async function getAdminOverview(actor: SessionUser | null) {
  assertRole(actor, "ADMIN");
  const [usersByRole, openByType, restaurantsByStatus, newCandidates, [lastRun]] =
    await Promise.all([
      countUsersByRole(),
      countOpenReviewItems(REVIEW_PAGE_TYPES),
      countRestaurantsByStatus(),
      countNewCandidates(),
      listRecentJobRuns(RECOMPUTE_JOB, 1),
    ]);
  return {
    usersByRole,
    openReviewItems: Object.values(openByType).reduce((sum, n) => sum + (n ?? 0), 0),
    restaurantsByStatus,
    newCandidates,
    lastRecompute: lastRun ? { startedAt: lastRun.startedAt, ok: lastRun.ok } : null,
  };
}
