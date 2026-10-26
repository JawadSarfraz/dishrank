// PATCH /api/v1/admin/users/:id (docs/06): `{ isPanel }` or `{ trustOverride }` (a number, or null
// to return to the trust table), one per request.
import { requireRole } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { setPanel, setTrustOverride } from "@/server/services/admin-users.service";
import { adminUserUpdateInput, parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/admin/users/[id]">) {
  try {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const input = parseInput(adminUserUpdateInput, await readJson(request));
    const userId = parseInput(id, (await ctx.params).id);
    const result =
      "isPanel" in input
        ? await setPanel(actor, userId, input.isPanel)
        : await setTrustOverride(actor, userId, input.trustOverride);
    for (const page of result.dishPages) revalidateDishPages(page);
    return jsonData(result);
  } catch (error) {
    return jsonError(error);
  }
}
