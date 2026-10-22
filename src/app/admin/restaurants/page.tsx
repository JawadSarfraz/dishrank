import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function AdminRestaurantsPage() {
  const user = await requirePageRole("ADMIN", "/admin/restaurants");
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Restaurants</h1>
      <p>Arrives in Phase 2 (docs/08).</p>
    </main>
  );
}
