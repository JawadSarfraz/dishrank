import { db } from "@/server/db";
import type { Role } from "@/server/roles";

export async function countUsersByRole(): Promise<Record<Role, number>> {
  const rows = await db.user.groupBy({ by: ["role"], _count: { _all: true } });
  const counts: Record<Role, number> = { USER: 0, OWNER: 0, ADMIN: 0 };
  for (const row of rows) counts[row.role] = row._count._all;
  return counts;
}
