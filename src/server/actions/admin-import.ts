"use server";
// /admin/import actions: auth → rate limit → validate → service → revalidate (CLAUDE.md conventions).
import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import {
  createFromCandidate,
  linkCandidate,
  reopenCandidate,
  skipCandidate,
} from "@/server/services/import.service";
import {
  candidateCreateInput,
  candidateLinkInput,
  candidateReopenInput,
  candidateSkipInput,
  parseInput,
} from "@/server/validation";
import { runAction } from "./result";

async function adminWriter() {
  const actor = await requireRole("ADMIN");
  await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
  return actor;
}

/** Create: the prefilled form the admin corrected and confirmed for one candidate. */
export async function createFromCandidateAction(input: unknown) {
  return runAction("import.create", async () => {
    const actor = await adminWriter();
    const result = await createFromCandidate(actor, parseInput(candidateCreateInput, input));
    revalidatePath(`/${result.citySlug}/r/${result.restaurant.slug}`);
    return {
      restaurant: result.restaurant,
      dishesAdded: result.dishes.filter((d) => d.created).length,
    };
  });
}

/** Link: this candidate is a restaurant we already have. */
export async function linkCandidateAction(input: unknown) {
  return runAction("import.link", async () => {
    const actor = await adminWriter();
    const result = await linkCandidate(actor, parseInput(candidateLinkInput, input));
    revalidatePath(`/${result.citySlug}/r/${result.restaurant.slug}`);
    return result;
  });
}

export async function skipCandidateAction(input: unknown) {
  return runAction("import.skip", async () => {
    const actor = await adminWriter();
    return skipCandidate(actor, parseInput(candidateSkipInput, input));
  });
}

export async function reopenCandidateAction(input: unknown) {
  return runAction("import.reopen", async () => {
    const actor = await adminWriter();
    const { candidateId } = parseInput(candidateReopenInput, input);
    return reopenCandidate(actor, candidateId);
  });
}
