"use server";
// /admin/users actions: auth → rate limit → validate → service → refresh.
import { refresh } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { setPanel } from "@/server/services/admin-users.service";
import { adminUserUpdateInput, parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

/** Panel on (trust 1.3) or off (trust from the docs/04 table); the user's rows are recomputed. */
export async function setPanelAction(userId: unknown, input: unknown) {
  return runAction("admin.user.panel", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const { isPanel } = parseInput(adminUserUpdateInput, input);
    const result = await setPanel(actor, parseInput(id, userId), isPanel);
    refresh();
    return result;
  });
}
