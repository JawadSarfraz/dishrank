import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function AdminUsersPage() {
  const user = await requirePageRole("ADMIN", "/admin/users");
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <p>Arrives in Phase 3 (docs/08).</p>
    </main>
  );
}
