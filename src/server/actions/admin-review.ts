"use server";
// /admin/review actions: auth → rate limit → validate → service → revalidate.
import { refresh, revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { resolveReviewItem } from "@/server/services/review.service";
import { parseInput, reviewFingerprint, reviewResolveInput } from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

/** `fingerprint`: the item as the card showed it; a changed item answers ITEM_CHANGED. */
export async function resolveReviewItemAction(
  itemId: unknown,
  input: unknown,
  fingerprint?: unknown,
) {
  return runAction("admin.review.resolve", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await resolveReviewItem(
      actor,
      parseInput(id, itemId),
      parseInput(reviewResolveInput, input),
      undefined,
      fingerprint === undefined ? undefined : parseInput(reviewFingerprint, fingerprint),
    );
    for (const r of result.restaurantSlugs) revalidatePath(`/${r.citySlug}/r/${r.slug}`);
    // Released or hidden ratings change scores and ranks on the public pages.
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return result;
  });
}
