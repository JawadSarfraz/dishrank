// GET /api/v1/dishes?city=&q=&launchOnly= (docs/06): the canonical dish list and dish search.
import { jsonData, jsonError } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { clientIp, ipHash } from "@/server/request-ip";
import { listDishes } from "@/server/services/dish.service";
import { dishSearchQuery, parseInput } from "@/server/validation";

export async function GET(request: Request) {
  try {
    const ip = ipHash(clientIp(request.headers));
    const query = parseInput(
      dishSearchQuery,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (query.q) await assertRateLimit(`ip:${ip}:search`, RATE_LIMITS.search);
    await assertRateLimit(`ip:${ip}:api`, RATE_LIMITS.api);
    return jsonData(await listDishes(query));
  } catch (error) {
    return jsonError(error);
  }
}
