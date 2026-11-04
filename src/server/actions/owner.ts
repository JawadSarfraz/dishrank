"use server";
// The owner area (/owner): auth → rate limit → validate → service → revalidate.
import { refresh } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { updateOwnerDish } from "@/server/services/owner.service";
import { ownerDishInput, parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

/** Confirm, remove or fix the name and price of one dish of the owner's restaurant. */
export async function updateOwnerDishAction(rowId: unknown, input: unknown) {
  return runAction("owner.dish", async () => {
    const actor = await requireRole(["OWNER", "ADMIN"]);
    await assertRateLimit(`user:${actor.id}:owner-write`, RATE_LIMITS.ownerWrite);
    const result = await updateOwnerDish(
      actor,
      parseInput(id, rowId),
      parseInput(ownerDishInput, input),
    );
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return { id: result.id, status: result.status };
  });
}
