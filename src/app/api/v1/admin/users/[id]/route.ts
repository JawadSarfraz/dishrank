// PATCH /api/v1/admin/users/:id (docs/06): Phase 3 changes only `{ isPanel }`.
import { requireRole } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { setPanel } from "@/server/services/admin-users.service";
import { adminUserUpdateInput, parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/admin/users/[id]">) {
  try {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const { isPanel } = parseInput(adminUserUpdateInput, await readJson(request));
    return jsonData(await setPanel(actor, parseInput(id, (await ctx.params).id), isPanel));
  } catch (error) {
    return jsonError(error);
  }
}
