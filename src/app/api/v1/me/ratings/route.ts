// GET /api/v1/me/ratings?cursor=&limit= (docs/06): own ratings with restaurant and dish.
import { requireUser } from "@/server/auth";
import { jsonError } from "@/server/http";
import { listMyRatings } from "@/server/services/rating.service";
import { meRatingsQuery, parseInput } from "@/server/validation";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const query = parseInput(meRatingsQuery, Object.fromEntries(new URL(request.url).searchParams));
    // Paginated answers are `{ data, nextCursor }` (docs/06).
    return Response.json(await listMyRatings(actor, query));
  } catch (error) {
    return jsonError(error);
  }
}
