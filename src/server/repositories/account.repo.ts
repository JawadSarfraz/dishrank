// Deleting one's own account (Phase 6). What goes and what stays is listed in deleteAccountTx.
import type { Prisma, ReviewItemType } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { emailHash } from "@/server/email-hash";
import { upsertBannedEmails } from "./ban.repo";
import type { Client, Tx } from "./transaction";

/** Every rating of the user, any status, with its dish row and photo. */
export async function listRatingsForDeletion(userId: string, client: Client = db) {
  return client.rating.findMany({
    where: { userId },
    select: { id: true, restaurantDishId: true, photoPath: true },
  });
}

/** Review items the user filed that nobody has decided yet: they go with the account. */
// DECISION-PENDING: decided items stay (the record of an admin's decision), without the name.
const FILED_BY_USER: ReviewItemType[] = [
  "FLAG",
  "DISH_PROPOSAL",
  "RESTAURANT_PROPOSAL",
  "OWNER_CLAIM",
];

/** Payload fields with contact details that a decided item must not keep after the account is gone. */
const CONTACT_FIELDS = ["phone", "proofNote", "contact"] as const;

/**
 * Deletes the account and everything that is only theirs, in one transaction (the caller holds the
 * locks of their dish rows and their user row):
 * - ratings with their history; open reports, disputes, suggestions and claims they filed;
 *   unused pairwise votes; their rate-limit counters;
 * - the User row, which takes sessions, Google accounts, panel locations, claims, flags and upload
 *   rows with it (onDelete Cascade).
 * Kept without the name (SET NULL): menu photos they uploaded (a restaurant's menu), review items
 * already decided (a claim's phone number and proof note and a dispute's contact are blanked, audit
 * 2026-11 A-02), and the restaurants they managed (no longer claimed). A banned account leaves the
 * one-way hash of its e-mail on the ban list, so the same Google account cannot sign up again
 * (audit 2026-11 A-01).
 */
export async function deleteAccountTx(userId: string, tx: Tx) {
  const ratings = await tx.rating.deleteMany({ where: { userId } });
  const items = await tx.reviewItem.deleteMany({
    where: { createdByUserId: userId, status: "OPEN", type: { in: FILED_BY_USER } },
  });
  const decided = await tx.reviewItem.findMany({
    where: {
      createdByUserId: userId,
      status: { not: "OPEN" },
      type: { in: ["OWNER_CLAIM", "FLAG"] },
    },
    select: { id: true, payload: true },
  });
  let redacted = 0;
  for (const item of decided) {
    const payload = item.payload as Record<string, unknown>;
    if (!CONTACT_FIELDS.some((field) => payload[field] != null)) continue;
    await tx.reviewItem.update({
      where: { id: item.id },
      data: {
        payload: {
          ...payload,
          phone: null,
          proofNote: null,
          contact: null,
          redacted: true,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    redacted++;
  }
  await tx.pairwiseVote.deleteMany({ where: { userId } });
  await tx.rateLimitBucket.deleteMany({ where: { key: { startsWith: `user:${userId}:` } } });
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { email: true, bannedAt: true },
  });
  const bannedKept = Boolean(user?.bannedAt);
  if (user?.bannedAt) await upsertBannedEmails([emailHash(user.email)], tx);
  await tx.user.delete({ where: { id: userId }, select: { id: true } });
  return {
    ratings: ratings.count,
    reviewItems: items.count,
    redactedItems: redacted,
    bannedKept,
  };
}
