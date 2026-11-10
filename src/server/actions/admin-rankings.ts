"use server";
// /admin/rankings actions: auth → rate limit → validate → service → revalidate.
import { refresh, revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { launchCity, recomputeNow, setFeatured } from "@/server/services/admin-rankings.service";
import { cityLaunchInput, featuredInput, parseInput } from "@/server/validation";
import { runAction } from "./result";

/** Runs the nightly recompute now and waits for it; every public page is then revalidated. */
export async function recomputeNowAction() {
  return runAction("admin.rankings.recompute", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await recomputeNow(actor);
    revalidatePath("/", "layout");
    return result;
  });
}

/** "Featured dishes": the home page, the city page and the dish pages concerned change at once. */
export async function setFeaturedAction(input: unknown) {
  return runAction("admin.city.featured", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await setFeatured(actor, parseInput(featuredInput, input));
    revalidatePath("/");
    revalidatePath(`/${result.slug}`);
    for (const dish of result.dishSlugs) revalidatePath(`/${result.slug}/best-${dish}`);
    refresh();
    return result;
  });
}

export async function launchCityAction(input: unknown) {
  return runAction("admin.city.launch", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const { city } = parseInput(cityLaunchInput, input);
    const result = await launchCity(actor, city);
    revalidatePath(`/${result.slug}`, "layout");
    revalidatePath("/");
    refresh();
    return result;
  });
}
