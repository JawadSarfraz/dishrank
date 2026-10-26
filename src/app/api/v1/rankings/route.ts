// GET /api/v1/rankings (docs/06): the ranking page's list, with optional area, sort and distance.
// Ranks stay city-wide when a filter narrows the list.
import { AppError } from "@/server/errors";
import { jsonData, jsonError } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { clientIp, ipHash } from "@/server/request-ip";
import { getRanking } from "@/server/services/ranking.service";
import { parseInput, rankingQuery } from "@/server/validation";

export async function GET(request: Request) {
  try {
    const ip = ipHash(clientIp(request.headers));
    const query = parseInput(rankingQuery, Object.fromEntries(new URL(request.url).searchParams));
    await assertRateLimit(`ip:${ip}:api`, RATE_LIMITS.api);
    const ranking = await getRanking({
      citySlug: query.city,
      dishSlug: query.dish,
      areaSlug: query.area,
      sort: query.sort,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
      limit: query.limit,
    });
    if (!ranking) throw new AppError("NOT_FOUND", "City or dish not found", 404);
    return jsonData(ranking);
  } catch (error) {
    return jsonError(error);
  }
}
