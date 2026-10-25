import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function AdminImportPage() {
  const user = await requirePageRole("ADMIN", "/admin/import");
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import</h1>
      <p className="text-sm">
        The Google Places import was removed (docs/02 ADR-13). The Overture review queue replaces
        it.
      </p>
    </main>
  );
}
