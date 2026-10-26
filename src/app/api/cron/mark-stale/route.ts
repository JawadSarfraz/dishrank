// Not scheduled: manual runs only (the nightly recompute already marks stale rows). Steps 4 and 5
// of docs/04 recomputeAll: stale marking, then a re-rank of every list.
import { revalidatePath } from "next/cache";
import { env } from "@/env";
import { cronFailure, requireCronSecret } from "@/server/cron";
import { markStaleAll } from "@/server/services/ranking-nightly.service";

export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronSecret(request, env.CRON_SECRET);
  if (denied) return denied;
  try {
    const { ok, summary } = await markStaleAll();
    revalidatePath("/", "layout");
    return Response.json({ ok, summary });
  } catch (error) {
    return cronFailure(error);
  }
}
