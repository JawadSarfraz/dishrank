"use server";
// /admin/import actions: auth → rate limit → validate → service → revalidate (CLAUDE.md conventions).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth";
import { AppError } from "@/server/errors";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { importCreate, importLink, previewImport } from "@/server/services/import.service";
import { importCreateInput, importLinkInput, parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** Parses the uploaded CSV and returns the preview. Writes nothing. */
export async function previewImportAction(formData: FormData) {
  return runAction("import.preview", async () => {
    const actor = await requireRole("ADMIN");
    const { cityId } = parseInput(z.object({ cityId: id }), { cityId: formData.get("cityId") });
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("VALIDATION_FAILED", "Choose a CSV file from tmp/", 400);
    }
    if (file.size > MAX_CSV_BYTES) {
      throw new AppError("CSV_TOO_LARGE", "The file is larger than 2 MB", 400);
    }
    return previewImport(actor, { cityId, csvText: await file.text() });
  });
}

/** Create: the form the admin confirmed for one row. */
export async function importCreateAction(input: unknown) {
  return runAction("import.create", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await importCreate(actor, parseInput(importCreateInput, input));
    return { restaurant: result.restaurant, restaurantDish: result.restaurantDish };
  });
}

/** Link: attach a row's place and dish to an existing restaurant. */
export async function importLinkAction(input: unknown) {
  return runAction("import.link", async () => {
    const actor = await requireRole("ADMIN");
    await assertRateLimit(`user:${actor.id}:admin-write`, RATE_LIMITS.adminWrite);
    const result = await importLink(actor, parseInput(importLinkInput, input));
    if (result.outcome === "linked")
      revalidatePath(`/${result.citySlug}/r/${result.restaurant.slug}`);
    return result;
  });
}
