// Menu uploads, their items and parse attempts (docs/03, docs/07 §3).
import type { MenuItemStatus, MenuUploadStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

export async function insertMenuUpload(
  data: { restaurantId: string; uploadedByUserId: string; filePath: string },
  client: Client = db,
) {
  return client.menuUpload.create({ data, select: { id: true, status: true } });
}

/** What a parse needs about an upload. */
export async function findMenuUploadForParse(id: string, client: Client = db) {
  return client.menuUpload.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      filePath: true,
      restaurantId: true,
      uploadedByUserId: true,
      restaurant: { select: { cityId: true } },
    },
  });
}

export async function updateMenuUpload(
  id: string,
  data: Prisma.MenuUploadUncheckedUpdateInput,
  client: Client = db,
) {
  return client.menuUpload.update({ where: { id }, data, select: { id: true, status: true } });
}

/** PENDING uploads, oldest first (the nightly parse). */
export async function listPendingMenuUploadIds(take: number) {
  const rows = await db.menuUpload.findMany({
    where: { status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function countMenuUploadsByStatus() {
  const rows = await db.menuUpload.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<MenuUploadStatus, number>
  >;
}

/** /admin/menus: one status, newest first, cursor = the last id of the previous page. */
export async function listMenuUploadsPage(input: {
  status: MenuUploadStatus;
  take: number;
  cursor?: string;
}) {
  return db.menuUpload.findMany({
    where: { status: input.status },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.take,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      error: true,
      createdAt: true,
      parsedAt: true,
      uploadedBy: { select: { email: true } },
      restaurant: { select: { id: true, name: true, area: { select: { name: true } } } },
      _count: { select: { items: true } },
    },
  });
}

/** Item counts per status of these uploads. */
export async function countItemsByStatus(uploadIds: readonly string[]) {
  if (uploadIds.length === 0) return [];
  return db.menuItem.groupBy({
    by: ["menuUploadId", "status"],
    where: { menuUploadId: { in: [...uploadIds] } },
    _count: { _all: true },
  });
}

/** The admin upload page: the upload, its items in menu order, and its parse attempts. */
export async function findMenuUploadForAdmin(id: string) {
  return db.menuUpload.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      filePath: true,
      error: true,
      createdAt: true,
      parsedAt: true,
      uploadedBy: { select: { email: true } },
      restaurant: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          area: { select: { name: true } },
          city: { select: { slug: true, name: true } },
        },
      },
      items: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          rawName: true,
          romanName: true,
          rawPrice: true,
          rawSection: true,
          status: true,
          matchConfidence: true,
          matchMethod: true,
          variantTags: true,
          matchedDish: { select: { id: true, slug: true, name: true } },
          reviewItem: {
            select: {
              id: true,
              status: true,
              payload: true,
              restaurantId: true,
              resolution: true,
            },
          },
        },
      },
      parses: {
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          trigger: true,
          model: true,
          startedAt: true,
          finishedAt: true,
          ok: true,
          error: true,
          inputTokens: true,
          outputTokens: true,
          matchCalls: true,
          matchInputTokens: true,
          matchOutputTokens: true,
        },
      },
    },
  });
}

// ---------- parse attempts ----------

/** Serialises parse claims, so the daily cap and the one-parse-per-upload rule hold under races. */
export async function lockMenuParses(tx: Tx) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('menu-parse'))`;
}

export async function countMenuParsesSince(since: Date, client: Client = db) {
  return client.menuParse.count({ where: { startedAt: { gte: since } } });
}

/** An unfinished attempt for this upload that started after `since` (a parse in progress). */
export async function findRunningMenuParse(uploadId: string, since: Date, client: Client = db) {
  return client.menuParse.findFirst({
    where: { menuUploadId: uploadId, finishedAt: null, startedAt: { gt: since } },
    select: { id: true },
  });
}

export async function insertMenuParse(
  data: { menuUploadId: string; trigger: string; model: string; startedAt: Date },
  tx: Tx,
) {
  return tx.menuParse.create({ data, select: { id: true } });
}

export async function finishMenuParse(
  id: string,
  data: {
    ok: boolean;
    error?: string | null;
    finishedAt: Date;
    inputTokens: number;
    outputTokens: number;
    matchCalls: number;
    matchInputTokens: number;
    matchOutputTokens: number;
  },
  client: Client = db,
) {
  return client.menuParse.update({ where: { id }, data, select: { id: true } });
}

// ---------- items ----------

export async function insertMenuItem(data: Prisma.MenuItemUncheckedCreateInput, tx: Tx) {
  return tx.menuItem.create({ data, select: { id: true } });
}

export async function updateMenuItem(
  id: string,
  data: Prisma.MenuItemUncheckedUpdateInput,
  client: Client = db,
) {
  return client.menuItem.update({ where: { id }, data, select: { id: true } });
}

export async function findMenuItemForDecision(id: string, client: Client = db) {
  return client.menuItem.findUnique({
    where: { id },
    select: {
      id: true,
      rawName: true,
      romanName: true,
      rawPrice: true,
      status: true,
      menuUploadId: true,
      menuUpload: { select: { id: true, status: true, restaurantId: true } },
    },
  });
}

/** The upload's MATCHED items of one dish, in menu order (they set the dish row's name and price). */
export async function listMatchedItemsOfDish(uploadId: string, dishId: string, tx: Tx) {
  return tx.menuItem.findMany({
    where: { menuUploadId: uploadId, matchedDishId: dishId, status: "MATCHED" },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { rawName: true, rawPrice: true, variantTags: true },
  });
}

export async function countItemsWithStatus(uploadId: string, status: MenuItemStatus, tx: Tx) {
  return tx.menuItem.count({ where: { menuUploadId: uploadId, status } });
}

/** Locks an upload for a review decision, so the last resolved item marks it REVIEWED exactly once. */
export async function lockMenuUpload(id: string, tx: Tx) {
  const rows = await tx.$queryRaw<{ status: MenuUploadStatus }[]>`
    SELECT status::text AS status FROM "MenuUpload" WHERE id = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}
