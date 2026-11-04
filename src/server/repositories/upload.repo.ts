// Signed uploads (Phase 6): who may use which storage path. Paths are random; ownership lives here.
import type { UploadKind } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

export async function insertUpload(data: {
  userId: string;
  kind: UploadKind;
  path: string;
  restaurantId?: string | null;
}) {
  return db.upload.create({ data, select: { id: true, path: true } });
}

export async function findUploadByPath(path: string, client: Client = db) {
  return client.upload.findUnique({
    where: { path },
    select: { id: true, userId: true, kind: true, restaurantId: true, createdAt: true },
  });
}

/**
 * Share-locks the caller's upload of this path while a rating or menu starts using it, so the
 * nightly clean-up (which deletes only unused rows) waits and then sees the new use. Null when the
 * row is gone or not theirs.
 */
export async function lockUploadForUse(path: string, userId: string, tx: Tx) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Upload" WHERE path = ${path} AND "userId" = ${userId} FOR SHARE`;
  return rows[0] ?? null;
}

/** Uploads older than `before` that no rating and no menu upload uses, oldest first. */
export async function listUnusedUploads(before: Date, take: number) {
  return db.$queryRaw<{ id: string; path: string; kind: UploadKind }[]>`
    SELECT u.id, u.path, u.kind::text AS kind
    FROM "Upload" u
    WHERE u."createdAt" < ${before}
      AND NOT EXISTS (SELECT 1 FROM "Rating" r WHERE r."photoPath" = u.path)
      AND NOT EXISTS (SELECT 1 FROM "MenuUpload" m WHERE m."filePath" = u.path)
    ORDER BY u."createdAt"
    LIMIT ${take}`;
}

/**
 * Deletes the row only while nothing uses its path (checked in the same statement, after any
 * share lock of a rating or menu being saved is released). Returns whether it was deleted.
 */
export async function deleteUploadIfUnused(id: string) {
  const deleted = await db.$executeRaw`
    DELETE FROM "Upload" u
    WHERE u.id = ${id}
      AND NOT EXISTS (SELECT 1 FROM "Rating" r WHERE r."photoPath" = u.path)
      AND NOT EXISTS (SELECT 1 FROM "MenuUpload" m WHERE m."filePath" = u.path)`;
  return deleted > 0;
}

/** The rows of these paths (their files were just deleted). */
export async function deleteUploadsByPath(paths: readonly string[], client: Client = db) {
  if (paths.length === 0) return 0;
  return (await client.upload.deleteMany({ where: { path: { in: [...paths] } } })).count;
}

/** Every upload of one user (account deletion). */
export async function listUploadsOfUser(userId: string, client: Client = db) {
  return client.upload.findMany({ where: { userId }, select: { path: true, kind: true } });
}
