"use server";
// /admin/review actions: auth → rate limit → validate → service → revalidate.
import { refresh, revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { resolveReviewItem } from "@/server/services/review.service";
import { parseInput, reviewResolveInput } from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

export async function resolveReviewItemAction(itemId: unknown, input: unknown) {
  return runAction("admin.review.resolve", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await resolveReviewItem(
      actor,
      parseInput(id, itemId),
      parseInput(reviewResolveInput, input),
    );
    for (const r of result.restaurantSlugs) revalidatePath(`/${r.citySlug}/r/${r.slug}`);
    refresh();
    return result;
  });
}
