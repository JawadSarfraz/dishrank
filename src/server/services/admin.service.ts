import { countUsersByRole } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";

/** Admin dashboard numbers. Checks the role itself, so a page that forgets its guard still gets FORBIDDEN. */
export async function getAdminOverview(actor: SessionUser | null) {
  assertRole(actor, "ADMIN");
  return { usersByRole: await countUsersByRole() };
}
