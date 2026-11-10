"use server";
// /admin/contenders actions: auth → rate limit → validate → service → revalidate.
import { refresh } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { revalidateDishPages } from "@/server/revalidate";
import { addContenders, setContenderRow } from "@/server/services/contenders.service";
import { contenderAddInput, contenderRowInput, parseInput } from "@/server/validation";
import { runAction } from "./result";

async function adminWriter() {
  const actor = await requireRole("ADMIN");
  await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
  return actor;
}

/** "Add" on /admin/contenders: a listed restaurant joins one or more dish lists, checked. */
export async function addContendersAction(input: unknown) {
  return runAction("contenders.add", async () => {
    const actor = await adminWriter();
    const result = await addContenders(actor, parseInput(contenderAddInput, input));
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return { restaurantId: result.restaurantId, dishes: result.dishPages.length };
  });
}

/** "Remove" and "Add back" on /admin/contenders: one dish row's REMOVED status. */
export async function setContenderRowAction(input: unknown) {
  return runAction("contenders.row", async () => {
    const actor = await adminWriter();
    const result = await setContenderRow(actor, parseInput(contenderRowInput, input));
    for (const page of result.dishPages) revalidateDishPages(page);
    refresh();
    return { id: result.id };
  });
}
