// POST /api/v1/uploads/sign (docs/06): a signed URL for one dish photo in the user's own folder of
// the public dish-photos bucket, valid 10 minutes. The browser resizes and re-encodes the photo
// first (src/lib/image.ts), which strips EXIF/GPS. Menu photos arrive with Phase 5.
import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { findRater } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import { getStorage, type StorageAdapter } from "@/server/storage";
import type { UploadSignInput } from "@/server/validation";

export const UPLOAD = {
  /** Owner's Phase 3 rule: a signed upload URL lives at most 10 minutes. */
  expiresInSeconds: 600,
  extensions: { "image/jpeg": "jpg", "image/webp": "webp" } as const,
  maxBytes: 5 * 1024 * 1024,
} as const;

/**
 * A rating's photo must be the user's own upload that really arrived: in their folder, present in
 * storage, ≤ 5 MB and JPEG or WebP (the bucket limits check the same, docs/10). A photo counts toward
 * trust (docs/04), so a path alone is not enough.
 */
export async function verifyUploadedPhoto(
  path: string,
  userId: string,
  storage: StorageAdapter | null,
) {
  if (!path.startsWith(`dish-photos/${userId}/`)) {
    throw new AppError("PHOTO_NOT_YOURS", "That photo was not uploaded by you", 400);
  }
  if (!storage) throw new AppError("UPLOADS_DISABLED", "Photo uploads are not set up yet", 400);
  const object = await storage.inspect({
    bucket: env.SUPABASE_DISH_PHOTOS_BUCKET,
    key: path.slice("dish-photos/".length),
  });
  if (!object) throw new AppError("PHOTO_NOT_FOUND", "The photo did not finish uploading", 400);
  const types: readonly string[] = Object.keys(UPLOAD.extensions);
  if (object.size > UPLOAD.maxBytes || !types.includes(object.contentType.split(";")[0])) {
    throw new AppError(
      "PHOTO_INVALID",
      "The photo must be a JPEG or WebP image of 5 MB or less",
      400,
    );
  }
}

export async function signPhotoUpload(
  actor: SessionUser | null,
  input: UploadSignInput,
  storage: StorageAdapter | null = getStorage(),
  now: Date = new Date(),
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  if (!storage) {
    throw new AppError("UPLOADS_DISABLED", "Photo uploads are not set up yet", 503);
  }
  if (input.kind !== "dish-photo") {
    throw new AppError("NOT_AVAILABLE", "Menu photo uploads arrive in Phase 5", 400);
  }
  const rater = await findRater(user.id);
  if (!rater || rater.bannedAt)
    throw new AppError("USER_BANNED", "This account cannot upload", 403);
  await assertRateLimit(`user:${user.id}:upload`, RATE_LIMITS.upload, now);

  // A random file name in the user's own folder: RatingService accepts only the user's own path.
  const key = `${user.id}/${randomUUID().replace(/-/g, "")}.${UPLOAD.extensions[input.contentType]}`;
  const signed = await storage.signUpload({
    bucket: env.SUPABASE_DISH_PHOTOS_BUCKET,
    key,
    contentType: input.contentType,
    expiresInSeconds: UPLOAD.expiresInSeconds,
  });
  logEvent("upload.sign", { userId: user.id, storage: storage.name, bytes: input.sizeBytes });
  return {
    path: `dish-photos/${key}`,
    uploadUrl: signed.uploadUrl,
    method: "PUT" as const,
    headers: signed.headers,
    expiresAt: signed.expiresAt.toISOString(),
  };
}
