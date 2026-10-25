import { ImportClient } from "@/components/admin/ImportClient";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getImportOptions } from "@/server/services/import.service";

export default async function AdminImportPage() {
  const user = await requirePageRole("ADMIN", "/admin/import");
  if (!user) return <Forbidden />;

  const options = await getImportOptions(user);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import</h1>
      <p className="text-sm">
        Search Google Places for a dish in one area. For each result, Create a restaurant (you type
        its name and address yourself), Link the place to one we already have, or Skip it. Only the
        place id, its location and the time of the search are saved.
      </p>
      <ImportClient options={options} />
    </main>
  );
}
