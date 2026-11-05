// POST /api/v1/events: a ranking page reports one view (light analytics, Phase 6). Anyone may
// send it; only the city and dish are kept, limited per IP hash. Answers 204.
import { jsonError, readJson } from "@/server/http";
import { clientIp, ipHash } from "@/server/request-ip";
import { recordRankingView } from "@/server/services/analytics.service";
import { parseInput, rankingViewInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    await recordRankingView(
      parseInput(rankingViewInput, await readJson(request)),
      ipHash(clientIp(request.headers)),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error, "/api/v1/events");
  }
}
