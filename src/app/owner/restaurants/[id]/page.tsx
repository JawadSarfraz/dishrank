import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function OwnerRestaurantPage({
  params,
}: PageProps<"/owner/restaurants/[id]">) {
  const { id } = await params;
  const user = await requirePageRole(
    ["OWNER", "ADMIN"],
    `/owner/restaurants/${encodeURIComponent(id)}`,
  );
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Restaurant</h1>
      <p>Arrives in Phase 6 (docs/08).</p>
    </main>
  );
}
