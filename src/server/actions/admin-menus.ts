"use server";
// /admin/menus actions: auth → rate limit → validate → service → revalidate.
import { refresh } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { parseMenuNow } from "@/server/services/menu.service";
import { parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

/** "Parse now": reads the photo and matches its items; waits for the result. */
export async function parseMenuNowAction(uploadId: unknown) {
  return runAction("admin.menu.parse", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await parseMenuNow(actor, parseInput(id, uploadId));
    // Menu-verified dish rows can become eligible: their ranking and restaurant pages change.
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return result;
  });
}
