// GET /api/v1/admin/review-queue?type=&status=OPEN&cursor= (docs/06).
import { requireRole } from "@/server/auth";
import { jsonError } from "@/server/http";
import { getReviewQueue } from "@/server/services/review.service";
import { parseInput, reviewQueueQuery } from "@/server/validation";

export async function GET(request: Request) {
  try {
    const actor = await requireRole("ADMIN");
    const query = parseInput(
      reviewQueueQuery,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { items, nextCursor, counts } = await getReviewQueue(actor, query);
    return Response.json({ data: items, nextCursor, counts });
  } catch (error) {
    return jsonError(error);
  }
}
