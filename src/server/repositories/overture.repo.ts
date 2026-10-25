// Overture candidates (docs/03 OvertureCandidate, docs/07 §1-2).
import type { CandidateStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

const CHUNK = 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Existing rows for these GERS ids (the sync never changes them, except lastSeenRelease). */
export async function findCandidatesByOvertureIds(overtureIds: readonly string[]) {
  const rows: { id: string; overtureId: string; lastSeenRelease: string }[] = [];
  for (const part of chunks(overtureIds)) {
    rows.push(
      ...(await db.overtureCandidate.findMany({
        where: { overtureId: { in: part } },
        select: { id: true, overtureId: true, lastSeenRelease: true },
      })),
    );
  }
  return rows;
}

/** Inserts new candidates; a GERS id that appeared meanwhile is skipped, never overwritten. */
export async function insertCandidates(rows: readonly Prisma.OvertureCandidateCreateManyInput[]) {
  let count = 0;
  for (const part of chunks(rows)) {
    count += (await db.overtureCandidate.createMany({ data: part, skipDuplicates: true })).count;
  }
  return count;
}

export async function setLastSeenRelease(ids: readonly string[], release: string) {
  let count = 0;
  for (const part of chunks(ids)) {
    count += (
      await db.overtureCandidate.updateMany({
        where: { id: { in: part } },
        data: { lastSeenRelease: release },
      })
    ).count;
  }
  return count;
}

/** NEW candidates per suggested area of a city (key null: no area suggested). */
export async function countNewCandidatesByArea(cityId: string) {
  const rows = await db.overtureCandidate.groupBy({
    by: ["suggestedAreaId"],
    where: { cityId, status: "NEW" },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.suggestedAreaId, r._count._all]));
}

/** The review list: one city, one suggested area (null = none), these statuses, best first. */
export async function listCandidatesForReview(input: {
  cityId: string;
  areaId: string | null;
  statuses: readonly CandidateStatus[];
  take: number;
}) {
  const where: Prisma.OvertureCandidateWhereInput = {
    cityId: input.cityId,
    suggestedAreaId: input.areaId,
    status: { in: [...input.statuses] },
  };
  const [items, total] = await Promise.all([
    db.overtureCandidate.findMany({
      where,
      orderBy: [{ confidence: "desc" }, { name: "asc" }, { id: "asc" }],
      take: input.take,
      include: {
        suggestedArea: { select: { id: true, slug: true, name: true } },
        restaurant: { select: { id: true, slug: true, name: true } },
      },
    }),
    db.overtureCandidate.count({ where }),
  ]);
  return { items, total };
}

/** Every located candidate of a city, any status: the other side of the 50 m duplicate check. */
export async function listLocatedCandidates(cityId: string) {
  return db.overtureCandidate.findMany({
    where: { cityId, lat: { not: null }, lng: { not: null } },
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      suggestedAreaId: true,
      status: true,
      skipReason: true,
      restaurant: { select: { id: true, slug: true, name: true } },
    },
  });
}

/** Locks one candidate row for a review action (released at commit or rollback). */
export async function lockCandidate(id: string, tx: Tx) {
  await tx.$queryRaw`SELECT id FROM "OvertureCandidate" WHERE id = ${id} FOR UPDATE`;
  return tx.overtureCandidate.findUnique({ where: { id } });
}

export async function updateCandidate(
  id: string,
  data: Prisma.OvertureCandidateUncheckedUpdateInput,
  client: Client = db,
) {
  return client.overtureCandidate.update({ where: { id }, data, select: { id: true } });
}

/** Merge: candidates created from or linked to the source now point at the target. */
export async function moveCandidatesToRestaurant(sourceId: string, targetId: string, tx: Tx) {
  return tx.overtureCandidate.updateMany({
    where: { restaurantId: sourceId },
    data: { restaurantId: targetId },
  });
}
