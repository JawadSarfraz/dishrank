// Daily 01:00 PKT (vercel.json), an hour before the recompute: up to 20 PENDING menu photos are
// read and matched (docs/07 §3), then the pages of the dish rows they verified are revalidated.
// Without the Anthropic variables it parses nothing and answers ok.
import { env } from "@/env";
import { cronFailure, requireCronSecret } from "@/server/cron";
import { revalidateDishPages } from "@/server/revalidate";
import { parsePendingMenus } from "@/server/services/menu.service";

export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronSecret(request, env.CRON_SECRET);
  if (denied) return denied;
  try {
    const { ok, summary, dishPages } = await parsePendingMenus({ trigger: "cron" });
    for (const page of dishPages) revalidateDishPages(page);
    return Response.json({ ok, summary }, { status: ok ? 200 : 500 });
  } catch (error) {
    return cronFailure(error);
  }
}
