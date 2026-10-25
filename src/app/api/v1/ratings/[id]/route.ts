// DELETE /api/v1/ratings/:id (docs/06): own ratings only; the dish row is recomputed.
import { requireUser } from "@/server/auth";
import { jsonData, jsonError } from "@/server/http";
import { revalidateDishPages } from "@/server/revalidate";
import { deleteOwn } from "@/server/services/rating.service";
import { parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/v1/ratings/[id]">) {
  try {
    const actor = await requireUser();
    const ratingId = parseInput(id, (await ctx.params).id);
    const deleted = await deleteOwn(actor, ratingId);
    revalidateDishPages(deleted);
    return jsonData({ id: deleted.id });
  } catch (error) {
    return jsonError(error);
  }
}
