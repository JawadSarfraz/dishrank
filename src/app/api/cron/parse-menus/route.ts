// Daily 01:00 PKT (vercel.json), an hour before the recompute: up to 20 PENDING menu photos are
// read and matched (docs/07 §3), then the pages of the dish rows they verified are revalidated.
// Without the Anthropic variables it parses nothing and answers ok. Then the upload clean-up runs
// (files no rating or menu has used for 24 hours are deleted, Phase 6), also when parsing failed.
import { env } from "@/env";
import { cronFailure, requireCronSecret } from "@/server/cron";
import { revalidateDishPages } from "@/server/revalidate";
import { parsePendingMenus } from "@/server/services/menu.service";
import { cleanupUnusedUploads } from "@/server/services/upload.service";

// DECISION-PENDING: the upload clean-up shares this cron (Hobby allows few daily crons).
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronSecret(request, env.CRON_SECRET);
  if (denied) return denied;
  let parsed: Awaited<ReturnType<typeof parsePendingMenus>> | null = null;
  let failure: unknown = null;
  try {
    parsed = await parsePendingMenus({ trigger: "cron" });
    for (const page of parsed.dishPages) revalidateDishPages(page);
  } catch (error) {
    failure = error;
  }
  try {
    const uploads = await cleanupUnusedUploads();
    if (failure) return cronFailure(failure);
    return Response.json(
      { ok: parsed!.ok, summary: parsed!.summary, uploads },
      { status: parsed!.ok ? 200 : 500 },
    );
  } catch (error) {
    return cronFailure(failure ?? error);
  }
}
