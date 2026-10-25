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

/** Inputs of the docs/04 trust table for one user, counted from their Rating rows. */
export async function findTrustStats(userId: string, client: Client = db) {
  const [user, byStatus, activePhotoRatings] = await Promise.all([
    client.user.findUnique({ where: { id: userId }, select: { isPanel: true } }),
    client.rating.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    client.rating.count({ where: { userId, status: "ACTIVE", photoPath: { not: null } } }),
  ]);
  if (!user) return null;
  const count = (status: string) => byStatus.find((r) => r.status === status)?._count._all ?? 0;
  return {
    isPanel: user.isPanel,
    activeRatings: count("ACTIVE"),
    activePhotoRatings,
    hiddenRatings: count("HIDDEN"),
    // DECISION-PENDING: a Flag points at a dish row, not a rating, so "upheld flags against their
    // ratings" cannot be counted yet; 0 until flags carry the rating they target.
    upheldFlags: 0,
  };
}

/** Dish rows where the user has a rating that counts (their trust feeds those rows' weights). */
export async function listRatedRowsOfUser(userId: string, client: Client = db) {
  const rows = await client.rating.findMany({
    where: { userId, status: "ACTIVE" },
    select: { restaurantDishId: true },
  });
  return [...new Set(rows.map((r) => r.restaurantDishId))];
}

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isPanel: boolean;
  trustScore: number;
  ratingsCount: number;
  bannedAt: Date | null;
  createdAt: Date;
};

/** /admin/users: newest first; `q` matches email or name. */
export async function listUsersPage(input: {
  q?: string;
  panelOnly: boolean;
  skip: number;
  take: number;
}) {
  const where: Prisma.UserWhereInput = {
    ...(input.panelOnly ? { isPanel: true } : {}),
    ...(input.q
      ? {
          OR: [
            { email: { contains: input.q, mode: "insensitive" } },
            { name: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: input.skip,
      take: input.take,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isPanel: true,
        trustScore: true,
        ratingsCount: true,
        bannedAt: true,
        createdAt: true,
      },
    }),
    db.user.count({ where }),
  ]);
  return { items: items as AdminUserRow[], total };
}

export async function updateUserById(
  id: string,
  data: Prisma.UserUpdateInput,
  client: Client = db,
) {
  return client.user.update({
    where: { id },
    data,
    select: { id: true, isPanel: true, trustScore: true },
  });
}
