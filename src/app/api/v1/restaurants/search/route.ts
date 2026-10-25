// GET /api/v1/restaurants/search?city=&q= (docs/06): ACTIVE restaurants of the city, max 8.
import { jsonData, jsonError } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { clientIp, ipHash } from "@/server/request-ip";
import { searchRestaurants } from "@/server/services/restaurant.service";
import { parseInput, restaurantSearchQuery } from "@/server/validation";

export async function GET(request: Request) {
  try {
    const ip = ipHash(clientIp(request.headers));
    await assertRateLimit(`ip:${ip}:search`, RATE_LIMITS.search);
    await assertRateLimit(`ip:${ip}:api`, RATE_LIMITS.api);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return jsonData(await searchRestaurants(parseInput(restaurantSearchQuery, params)));
  } catch (error) {
    return jsonError(error);
  }
}
