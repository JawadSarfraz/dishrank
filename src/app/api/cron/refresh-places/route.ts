// Daily (vercel.json, 0 22 * * * UTC). Places coordinate refresh, docs/07 §5.
import { env } from "@/env";
import { requireCronSecret } from "@/server/cron";
import { createPlacesClient } from "@/server/places";
import { refreshPlaces } from "@/server/services/places-refresh.service";

// The job stops itself before 250 s (REFRESH_TIME); this is the platform limit above it.
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronSecret(request, env.CRON_SECRET);
  if (denied) return denied;

  const places = env.GOOGLE_PLACES_API_KEY
    ? createPlacesClient({ apiKey: env.GOOGLE_PLACES_API_KEY })
    : null;
  try {
    const { ok, summary } = await refreshPlaces({ places });
    return Response.json({ ok, summary }, { status: ok ? 200 : 500 });
  } catch {
    // Logged with its JobRun by the service.
    return Response.json(
      { ok: false, error: { code: "INTERNAL", message: "refresh-places failed" } },
      { status: 500 },
    );
  }
}
