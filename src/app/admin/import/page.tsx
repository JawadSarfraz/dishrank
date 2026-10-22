import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function AdminImportPage() {
  const user = await requirePageRole("ADMIN", "/admin/import");
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import</h1>
      <p>Arrives in Phase 2 (docs/08).</p>
    </main>
  );
}
