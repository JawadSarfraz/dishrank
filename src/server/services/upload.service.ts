// POST /api/v1/uploads/sign (docs/06): a signed URL, valid 10 minutes, for one dish photo in the
// public dish-photos bucket (dish-photos/<random>.<ext>) or one menu photo in the private menus
// bucket (menus/<restaurantId>/<random>.<ext>). Paths never contain the user id (owner, Phase 6):
// an Upload row records who signed it, and a rating or menu accepts the path only from that user.
// The browser resizes and re-encodes the photo first (src/lib/image.ts), which strips EXIF/GPS.
// Files nothing has used for 24 hours are deleted by the nightly clean-up (cleanupUnusedUploads).
import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import { findRatingByPhotoPath } from "@/server/repositories/rating.repo";
import {
  deleteUploadIfUnused,
  deleteUploadsByPath,
  findUploadByPath,
  insertUpload,
  listUnusedUploads,
} from "@/server/repositories/upload.repo";
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
export const PHOTO_PREFIX = "dish-photos/";
/** A MenuUpload's filePath is this prefix + the object key in the private menus bucket. */
export const MENU_PREFIX = "menus/";

/** A stored object the app accepts as a photo: ≤ 5 MB, JPEG or WebP. */
export function isAcceptedPhoto(object: { size: number; contentType: string }): boolean {
  const types: readonly string[] = Object.keys(UPLOAD.extensions);
  return object.size <= UPLOAD.maxBytes && types.includes(object.contentType.split(";")[0]);
}

/** A path signed before Phase 6 (dish-photos/<userId>/<random>): ownership is in the path. */
const legacyOwner = (path: string, userId: string) => path.startsWith(`${PHOTO_PREFIX}${userId}/`);

/**
 * A rating's photo must be the user's own upload that really arrived: signed by them (their Upload
 * row; or, for a path signed before Phase 6, their folder), present in storage, ≤ 5 MB and JPEG or
 * WebP (the bucket limits check the same, docs/10). A photo counts toward trust (docs/04), so a
 * path alone is not enough.
 */
export async function verifyUploadedPhoto(
  path: string,
  userId: string,
  storage: StorageAdapter | null,
) {
  const upload = legacyOwner(path, userId) ? null : await findUploadByPath(path);
  if (!legacyOwner(path, userId) && (upload?.userId !== userId || upload.kind !== "DISH_PHOTO")) {
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

  // A random file name, never the user id; the Upload row says whose it is.
  const file = `${randomUUID().replace(/-/g, "")}.${UPLOAD.extensions[input.contentType]}`;
  const key = menu ? `${input.restaurantId}/${file}` : file;
  const path = `${menu ? MENU_PREFIX : PHOTO_PREFIX}${key}`;
  await insertUpload({
    userId: user.id,
    kind: menu ? "MENU" : "DISH_PHOTO",
    path,
    restaurantId: menu ? input.restaurantId : null,
  });
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
    path,
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
      await deleteUploadsByPath([path]);
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

export const UPLOAD_CLEANUP = {
  /** A file nothing used for this long is deleted (owner, Phase 6). */
  unusedForMs: 24 * 3_600_000,
  /** At most this many per run; the rest go the next night. */
  perRun: 500,
} as const;

/** The bucket and key of an upload's path. */
function locate(path: string) {
  return path.startsWith(MENU_PREFIX)
    ? { bucket: env.SUPABASE_MENUS_BUCKET, key: path.slice(MENU_PREFIX.length) }
    : { bucket: env.SUPABASE_DISH_PHOTOS_BUCKET, key: path.slice(PHOTO_PREFIX.length) };
}

/**
 * The nightly clean-up (/api/cron/parse-menus runs it after the parses): uploads that no rating and
 * no menu upload has used for 24 hours lose their row and their file. The row goes first, in one
 * statement that re-checks "unused" after any rating or menu being saved with it has committed
 * (they share-lock the row), so a file in use is never deleted. Without storage nothing is deleted.
 * Files signed before Phase 6 have no row and are not seen here.
 */
export async function cleanupUnusedUploads(
  storage: StorageAdapter | null = getStorage(),
  now: Date = new Date(),
) {
  const summary = { checked: 0, deleted: 0, failed: 0, skipped: false };
  if (!storage) return { ...summary, skipped: true };
  const unused = await listUnusedUploads(
    new Date(now.getTime() - UPLOAD_CLEANUP.unusedForMs),
    UPLOAD_CLEANUP.perRun,
  );
  for (const upload of unused) {
    summary.checked++;
    try {
      if (!(await deleteUploadIfUnused(upload.id))) continue;
      await storage.remove(locate(upload.path));
      summary.deleted++;
    } catch (error) {
      summary.failed++;
      // The row may be gone already: the path is logged for a manual clean-up.
      logEvent(
        "upload.cleanup_failed",
        { path: upload.path, error: error instanceof Error ? error.message : String(error) },
        "error",
      );
    }
  }
  logEvent("upload.cleanup", summary);
  return summary;
}
