// Panel invite links (docs/07 §7a). Rows carry the token's hash, never the token.
import { db } from "@/server/db";
import type { Client, Tx } from "./transaction";

export async function insertPanelInvite(data: {
  tokenHash: string;
  label: string;
  maxUses: number;
  expiresAt: Date;
  createdByUserId: string;
}) {
  return db.panelInvite.create({
    data,
    select: { id: true, label: true, maxUses: true, expiresAt: true },
  });
}

/** Newest first, with who joined through each link. */
export async function listPanelInvites(take: number) {
  return db.panelInvite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      label: true,
      maxUses: true,
      usesCount: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      uses: {
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export async function findPanelInviteByHash(tokenHash: string, client: Client = db) {
  return client.panelInvite.findUnique({
    where: { tokenHash },
    select: { id: true, maxUses: true, usesCount: true, expiresAt: true, revokedAt: true },
  });
}

/** One redemption at a time per link, so its limit holds (released at commit or rollback). */
export async function lockPanelInviteByHash(tokenHash: string, tx: Tx) {
  await tx.$queryRaw`SELECT id FROM "PanelInvite" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
  return findPanelInviteByHash(tokenHash, tx);
}

export async function findPanelInviteUse(inviteId: string, userId: string, client: Client = db) {
  return client.panelInviteUse.findUnique({
    where: { inviteId_userId: { inviteId, userId } },
    select: { id: true },
  });
}

export async function recordPanelInviteUse(inviteId: string, userId: string, tx: Tx) {
  await tx.panelInviteUse.create({ data: { inviteId, userId } });
  await tx.panelInvite.update({ where: { id: inviteId }, data: { usesCount: { increment: 1 } } });
}

/** Sets revokedAt once; a link already revoked keeps its first date. Returns how many changed. */
export async function revokePanelInviteById(id: string, at: Date) {
  const { count } = await db.panelInvite.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: at },
  });
  return count;
}

export async function panelInviteExists(id: string) {
  return (await db.panelInvite.count({ where: { id } })) > 0;
}
