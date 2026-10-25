// GET /api/v1/cities (docs/06): cities with their areas.
import { jsonData, jsonError } from "@/server/http";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { clientIp, ipHash } from "@/server/request-ip";
import { listCities } from "@/server/services/dish.service";

export async function GET(request: Request) {
  try {
    await assertRateLimit(`ip:${ipHash(clientIp(request.headers))}:api`, RATE_LIMITS.api);
    // Ids are included: a restaurant proposal (POST /api/v1/proposals) needs cityId and areaId.
    return jsonData(await listCities());
  } catch (error) {
    return jsonError(error);
  }
}
