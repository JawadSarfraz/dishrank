import { ImportClient } from "@/components/admin/ImportClient";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getImportCities } from "@/server/services/import.service";

export default async function AdminImportPage() {
  const user = await requirePageRole("ADMIN", "/admin/import");
  if (!user) return <Forbidden />;

  const cities = await getImportCities(user);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import</h1>
      <p className="text-sm">
        Upload a candidates CSV written by <code>pnpm seed:places</code>. For each row, Create a
        restaurant (you check and confirm the name and address), Link it to an existing one, or Skip
        it. Rows fetched more than 30 days ago cannot be imported: run the script again.
      </p>
      <ImportClient cities={cities} />
    </main>
  );
}
