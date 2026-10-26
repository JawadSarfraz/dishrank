// Daily 02:00 PKT (vercel.json): the nightly recompute (docs/04 recomputeAll), then every public
// page is revalidated, so decayed scores and new ranks show at the next visit.
import { revalidatePath } from "next/cache";
import { env } from "@/env";
import { cronFailure, requireCronSecret } from "@/server/cron";
import { recomputeAll } from "@/server/services/ranking-nightly.service";

export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronSecret(request, env.CRON_SECRET);
  if (denied) return denied;
  try {
    const { ok, summary } = await recomputeAll({ trigger: "cron" });
    revalidatePath("/", "layout");
    return Response.json({ ok, summary }, { status: ok ? 200 : 500 });
  } catch (error) {
    return cronFailure(error);
  }
}
