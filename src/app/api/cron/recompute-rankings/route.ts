// Daily 02:00 PKT (vercel.json). RankingService.recomputeAll() arrives in Phase 4.
import { env } from "@/env";
import { requireCronSecret } from "@/server/cron";

export async function GET(request: Request) {
  const denied = requireCronSecret(request, env.CRON_SECRET);
  if (denied) return denied;
  return Response.json({ ok: true, stub: true });
}
