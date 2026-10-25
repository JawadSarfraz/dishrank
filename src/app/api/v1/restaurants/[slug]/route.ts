// GET /api/v1/restaurants/:slug (docs/06). A merged restaurant answers 301 to its survivor.
import { isSlug } from "@/lib/slug";
import { AppError } from "@/server/errors";
import { jsonData, jsonError } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { clientIp, ipHash } from "@/server/request-ip";
import { getPublicRestaurant } from "@/server/services/restaurant.service";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/restaurants/[slug]">) {
  try {
    await assertRateLimit(`ip:${ipHash(clientIp(request.headers))}:api`, RATE_LIMITS.api);
    const { slug } = await ctx.params;
    const result = isSlug(slug)
      ? await getPublicRestaurant(slug)
      : ({ kind: "not_found" } as const);
    if (result.kind === "not_found") {
      throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    }
    if (result.kind === "redirect") {
      return Response.redirect(new URL(`/api/v1/restaurants/${result.slug}`, request.url), 301);
    }
    const { restaurant, dishes, claimed } = result;
    return jsonData({ restaurant, dishes, claimed });
  } catch (error) {
    return jsonError(error);
  }
}
