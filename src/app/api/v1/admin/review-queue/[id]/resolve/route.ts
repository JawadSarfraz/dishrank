// POST /api/v1/admin/review-queue/:id/resolve { action, payload, fingerprint? } (docs/06, docs/07 §6).
import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { resolveReviewItem } from "@/server/services/review.service";
import { parseInput, parseReviewResolveBody } from "@/server/validation";
import { id } from "@/server/validation/common";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/v1/admin/review-queue/[id]/resolve">,
) {
  try {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const { input, fingerprint } = parseReviewResolveBody(await readJson(request));
    const result = await resolveReviewItem(
      actor,
      parseInput(id, (await ctx.params).id),
      input,
      undefined,
      fingerprint,
    );
    for (const r of result.restaurantSlugs) revalidatePath(`/${r.citySlug}/r/${r.slug}`);
    for (const page of result.dishPages) revalidateDishPages(page);
    return jsonData(result);
  } catch (error) {
    return jsonError(error);
  }
}
