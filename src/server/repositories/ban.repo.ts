// The ban list (BannedEmail): one-way e-mail hashes of banned accounts (audit 2026-11, A-01).
import { db } from "@/server/db";
import type { Client } from "./transaction";

export async function upsertBannedEmails(hashes: readonly string[], client: Client = db) {
  if (hashes.length === 0) return 0;
  const result = await client.bannedEmail.createMany({
    data: hashes.map((emailHash) => ({ emailHash })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function findBannedEmail(emailHash: string, client: Client = db) {
  return client.bannedEmail.findUnique({ where: { emailHash }, select: { emailHash: true } });
}

/** The e-mail addresses of these users (for the ban list). */
export async function listUserEmails(ids: readonly string[], client: Client = db) {
  if (ids.length === 0) return [];
  const rows = await client.user.findMany({
    where: { id: { in: [...ids] } },
    select: { email: true },
  });
  return rows.map((r) => r.email);
}
