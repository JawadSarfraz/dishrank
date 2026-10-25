"use server";
// /admin/import actions: auth → validate → rate limit → service → revalidate (CLAUDE.md conventions).
// Search results go back to the admin's browser only: nothing from them is saved here.
import { revalidatePath } from "next/cache";
import { env } from "@/env";
import { requireRole } from "@/server/auth";
import { AppError } from "@/server/errors";
import { createPlacesClient } from "@/server/places";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { importCreate, importLink, searchPlacesForImport } from "@/server/services/import.service";
import {
  importCreateInput,
  importLinkInput,
  parseInput,
  placesSearchInput,
} from "@/server/validation";
import { runAction } from "./result";

/** One page of the live Text Search ("Search" or "Load more"). */
export async function searchPlacesAction(input: unknown) {
  return runAction("import.search", async () => {
    const actor = await requireRole("ADMIN");
    const query = parseInput(placesSearchInput, input);
    if (!env.GOOGLE_PLACES_API_KEY) {
      throw new AppError(
        "PLACES_KEY_MISSING",
        "GOOGLE_PLACES_API_KEY is not set on the server",
        503,
      );
    }
    // Counted only when a Google call follows; one budget for all admins (the free monthly cap).
    await assertRateLimit("global:places-search", RATE_LIMITS.placesSearch);
    const places = createPlacesClient({ apiKey: env.GOOGLE_PLACES_API_KEY });
    return searchPlacesForImport(actor, query, places);
  });
}

/** Create: the form the admin typed and confirmed for one search result. */
export async function importCreateAction(input: unknown) {
  return runAction("import.create", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await importCreate(actor, parseInput(importCreateInput, input));
    return { restaurant: result.restaurant, restaurantDish: result.restaurantDish };
  });
}

/** Link: attach a result's place and dish to an existing restaurant. */
export async function importLinkAction(input: unknown) {
  return runAction("import.link", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await importLink(actor, parseInput(importLinkInput, input));
    if (result.outcome === "linked") {
      revalidatePath(`/${result.citySlug}/r/${result.restaurant.slug}`);
    }
    return result;
  });
}
