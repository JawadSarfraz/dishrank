import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function AdminRankingsPage() {
  const user = await requirePageRole("ADMIN", "/admin/rankings");
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Rankings</h1>
      <p>Arrives in Phase 4 (docs/08).</p>
    </main>
  );
}
