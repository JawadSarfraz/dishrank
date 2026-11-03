// POST /api/v1/uploads/sign (docs/06): a signed URL, valid 10 minutes, for one dish photo in the
// user's own folder of the public dish-photos bucket, or one menu photo in the private menus bucket
// (docs/07 §3: menus/<restaurantId>/<userId>/<random>). The browser resizes and re-encodes the
// photo first (src/lib/image.ts), which strips EXIF/GPS.
import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { findRatingByPhotoPath } from "@/server/repositories/rating.repo";
import { findRater } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import { getStorage, type StorageAdapter } from "@/server/storage";
import type { UploadSignInput } from "@/server/validation";
import { assertMenuUploader } from "./menu-access";

export const UPLOAD = {
  /** Owner's Phase 3 rule: a signed upload URL lives at most 10 minutes. */
  expiresInSeconds: 600,
  extensions: { "image/jpeg": "jpg", "image/webp": "webp" } as const,
  maxBytes: 5 * 1024 * 1024,
} as const;

/** A rating's photoPath is this prefix + the object key in the dish-photos bucket. */
const PHOTO_PREFIX = "dish-photos/";
/** A MenuUpload's filePath is this prefix + the object key in the private menus bucket. */
export const MENU_PREFIX = "menus/";

/** A stored object the app accepts as a photo: ≤ 5 MB, JPEG or WebP. */
export function isAcceptedPhoto(object: { size: number; contentType: string }): boolean {
  const types: readonly string[] = Object.keys(UPLOAD.extensions);
  return object.size <= UPLOAD.maxBytes && types.includes(object.contentType.split(";")[0]);
}

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
  if (!path.startsWith(`${PHOTO_PREFIX}${userId}/`)) {
    throw new AppError("PHOTO_NOT_YOURS", "That photo was not uploaded by you", 400);
  }
  if (!storage) throw new AppError("UPLOADS_DISABLED", "Photo uploads are not set up yet", 400);
  const object = await storage.inspect({
    bucket: env.SUPABASE_DISH_PHOTOS_BUCKET,
    key: path.slice(PHOTO_PREFIX.length),
  });
  if (!object) throw new AppError("PHOTO_NOT_FOUND", "The photo did not finish uploading", 400);
  if (!isAcceptedPhoto(object)) {
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
  const rater = await findRater(user.id);
  if (!rater || rater.bannedAt)
    throw new AppError("USER_BANNED", "This account cannot upload", 403);
  // Menus: only panel members, the restaurant's owner and admins (checked before counting).
  const menu = input.kind === "menu";
  if (menu) {
    if (!input.restaurantId) {
      throw new AppError("VALIDATION_FAILED", "A menu photo needs its restaurant", 400);
    }
    await assertMenuUploader(user, input.restaurantId);
  }
  await assertRateLimit(`user:${user.id}:upload`, RATE_LIMITS.upload, now);

  // A random file name in the user's own folder: the rating and menu services accept only that.
  const file = `${randomUUID().replace(/-/g, "")}.${UPLOAD.extensions[input.contentType]}`;
  const key = menu ? `${input.restaurantId}/${user.id}/${file}` : `${user.id}/${file}`;
  const signed = await storage.signUpload({
    bucket: menu ? env.SUPABASE_MENUS_BUCKET : env.SUPABASE_DISH_PHOTOS_BUCKET,
    key,
    contentType: input.contentType,
    expiresInSeconds: UPLOAD.expiresInSeconds,
  });
  logEvent("upload.sign", {
    userId: user.id,
    kind: input.kind,
    storage: storage.name,
    bytes: input.sizeBytes,
  });
  return {
    path: `${menu ? MENU_PREFIX : PHOTO_PREFIX}${key}`,
    uploadUrl: signed.uploadUrl,
    method: "PUT" as const,
    headers: signed.headers,
    expiresAt: signed.expiresAt.toISOString(),
  };
}

/**
 * Deletes photo files no rating uses any more: after a rating was deleted, its photo replaced or
 * removed, or the rating merged away. Called after the database change committed, so it never fails
 * the request: a failure is logged with the path for a manual clean-up. A path that a rating uses
 * again by now is kept.
 */
export async function deleteUnusedPhotos(
  paths: readonly (string | null | undefined)[],
  storage: StorageAdapter | null = getStorage(),
) {
  const unique = new Set(paths.filter((p): p is string => Boolean(p?.startsWith(PHOTO_PREFIX))));
  for (const path of unique) {
    try {
      if (await findRatingByPhotoPath(path)) continue;
      if (!storage) {
        logEvent("photo.delete_skipped", { path, reason: "storage not configured" }, "warn");
        continue;
      }
      await storage.remove({
        bucket: env.SUPABASE_DISH_PHOTOS_BUCKET,
        key: path.slice(PHOTO_PREFIX.length),
      });
      logEvent("photo.delete", { path });
    } catch (error) {
      logEvent(
        "photo.delete_failed",
        { path, error: error instanceof Error ? error.message : String(error) },
        "error",
      );
    }
  }
}
