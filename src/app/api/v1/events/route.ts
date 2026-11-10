// POST /api/v1/events: the browser reports a ranking view, a share click or a sign-in step (light
// analytics, docs/06). Anyone may send it; only the name, the city, the dish and the visit's source
// tag are kept, limited per IP hash. Answers 204.
import { jsonError, readJson } from "@/server/http";
import { clientIp, ipHash } from "@/server/request-ip";
import { recordBrowserEvent } from "@/server/services/analytics.service";
import { browserEventInput, parseInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    await recordBrowserEvent(
      parseInput(browserEventInput, await readJson(request)),
      ipHash(clientIp(request.headers)),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error, "/api/v1/events");
  }
}
