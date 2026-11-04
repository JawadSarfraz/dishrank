// GET /api/health (uptime monitor, docs/06): 200 {"ok":true} when the database answers a trivial
// query within 3 s, otherwise 503 {"ok":false}; past its per-IP limit 429 {"ok":false}. No details in
// the answer (the reason is logged), never cached, no sign-in, and no analytics event. HEAD works
// too: Next.js answers it from GET.
import { clientIp, ipHash } from "@/server/request-ip";
import { checkHealth } from "@/server/services/health.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { ok, status } = await checkHealth(ipHash(clientIp(request.headers)));
  return Response.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });
}
