"use server";
// "Is this your restaurant?" on a restaurant page (docs/07 §4): auth → validate → service (the rate
// limit lives in the service).
import { requireUser } from "@/server/auth";
import { submitClaim } from "@/server/services/claim.service";
import { claimInput, parseInput } from "@/server/validation";
import { runAction } from "./result";

export async function claimRestaurantAction(input: unknown) {
  return runAction("claim.submit", async () => {
    const actor = await requireUser();
    return submitClaim(actor, parseInput(claimInput, input));
  });
}
