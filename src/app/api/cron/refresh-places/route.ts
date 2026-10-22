// Daily (vercel.json). Places coordinate refresh (docs/07 §5) arrives in Phase 2.
import { env } from "@/env";
import { requireCronSecret } from "@/server/cron";

export async function GET(request: Request) {
  const denied = requireCronSecret(request, env.CRON_SECRET);
  if (denied) return denied;
  return Response.json({ ok: true, stub: true });
}
