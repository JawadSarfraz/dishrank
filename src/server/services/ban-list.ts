// The ban list (audit 2026-11, A-01): a banned account may delete itself like any other, but a
// one-way hash of its e-mail stays in BannedEmail, and Better Auth's sign-up hook refuses the same
// Google account afterwards (src/server/auth.ts). /privacy says so.
import { emailHash } from "@/server/email-hash";
import { logEvent } from "@/server/log";
import {
  findBannedEmail,
  listUserEmails,
  upsertBannedEmails,
} from "@/server/repositories/ban.repo";
import type { Client } from "@/server/repositories/transaction";

/** Puts these users' addresses on the ban list (an admin's ban decision). */
export async function recordBannedUsers(userIds: readonly string[], client: Client) {
  const emails = await listUserEmails(userIds, client);
  const added = await upsertBannedEmails(emails.map(emailHash), client);
  logEvent("ban_list.add", { users: userIds.length, added });
  return added;
}

/** Puts one address on the ban list (a banned account deleting itself keeps the ban this way). */
export async function recordBannedEmail(email: string, client: Client) {
  return upsertBannedEmails([emailHash(email)], client);
}

/** True when this address belongs to a banned account that may not sign up again. */
export async function isEmailBanned(email: string, client?: Client): Promise<boolean> {
  return (await findBannedEmail(emailHash(email), client)) !== null;
}
