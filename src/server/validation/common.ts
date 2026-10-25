import { z } from "zod";
import { SLUG_PATTERN } from "@/lib/slug";
import { AppError } from "@/server/errors";

/** Prisma cuid ids: lowercase letters and digits. */
export const id = z.string().regex(/^[a-z0-9]{8,64}$/, "Invalid id");

export const slug = z.string().max(80).regex(SLUG_PATTERN, "Invalid slug");

/** Trimmed text; an empty string after trimming counts as missing. */
export function text(max: number, min = 1) {
  return z.preprocess(blankToUndefined, z.string().trim().min(min).max(max));
}

export function optionalText(max: number) {
  return z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
}

/** Query-string values: "" and absent both mean "not given". */
export function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

export function optionalQuery<T extends z.ZodType>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional());
}

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

/** Pakistani and international phone numbers; spaces and dashes are removed. */
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{8,18}[0-9]$/, "Invalid phone number")
  .transform((v) => v.replace(/[ -]/g, ""));

/** Google Places (New) place id. */
export const googlePlaceId = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/, "Invalid Google place id");

/** Parses or throws AppError VALIDATION_FAILED (400) with per-field messages (docs/06 error shape). */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError(
    "VALIDATION_FAILED",
    "Some fields are invalid",
    400,
    z.flattenError(result.error),
  );
}
