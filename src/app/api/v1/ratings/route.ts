// POST /api/v1/ratings (docs/06): rate a dish at a restaurant; replaces the user's earlier rating.
import { requireUser } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { clientIp, ipHash } from "@/server/request-ip";
import { revalidateDishPages } from "@/server/revalidate";
import { createOrReplace } from "@/server/services/rating.service";
import { parseInput, ratingInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const input = parseInput(ratingInput, await readJson(request));
    const result = await createOrReplace(actor, input, {
      ipHash: ipHash(clientIp(request.headers)),
    });
    revalidateDishPages({
      citySlug: result.restaurant.citySlug,
      dishSlug: result.dish.slug,
      restaurantSlug: result.restaurant.slug,
    });
    // A held rating is still a 200: `held: true` says it waits for review (docs/06).
    return jsonData(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
