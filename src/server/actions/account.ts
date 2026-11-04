"use server";
// "Delete my account" on /me: auth → validate → service (rate limit inside) → revalidate. The
// session row is gone with the user; the now useless cookie is cleared too.
import { cookies } from "next/headers";
import { requireUser } from "@/server/auth";
import { revalidateDishPages } from "@/server/revalidate";
import { deleteMyAccount } from "@/server/services/account.service";
import { accountDeleteInput, parseInput } from "@/server/validation";
import { runAction } from "./result";

/** Better Auth's session cookie, without and with the Secure prefix (http and https). */
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export async function deleteAccountAction(input: unknown) {
  return runAction("account.delete", async () => {
    const actor = await requireUser();
    const result = await deleteMyAccount(actor, parseInput(accountDeleteInput, input));
    for (const page of result.dishPages) revalidateDishPages(page);
    const jar = await cookies();
    for (const name of SESSION_COOKIES) jar.delete(name);
    return { deleted: true };
  });
}
