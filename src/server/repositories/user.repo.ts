import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Role } from "@/server/roles";
import type { Client, Tx } from "./transaction";

export async function countUsersByRole(): Promise<Record<Role, number>> {
  const rows = await db.user.groupBy({ by: ["role"], _count: { _all: true } });
  const counts: Record<Role, number> = { USER: 0, OWNER: 0, ADMIN: 0 };
  for (const row of rows) counts[row.role] = row._count._all;
  return counts;
}

/** What the rating rules need about a rater, always read from the database. */
export async function findRater(id: string, client: Client = db) {
  return client.user.findUnique({
    where: { id },
    select: { id: true, isPanel: true, trustScore: true, createdAt: true, bannedAt: true },
  });
}

/** Keeps User.ratingsCount and photoRatings in step with the user's ratings. */
export async function adjustRatingCounters(
  id: string,
  delta: { ratings: number; photos: number },
  tx: Tx,
) {
  if (delta.ratings === 0 && delta.photos === 0) return;
  const data: Prisma.UserUpdateInput = {};
  if (delta.ratings !== 0) data.ratingsCount = { increment: delta.ratings };
  if (delta.photos !== 0) data.photoRatings = { increment: delta.photos };
  await tx.user.update({ where: { id }, data, select: { id: true } });
}
