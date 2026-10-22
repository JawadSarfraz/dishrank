import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function OwnerHomePage() {
  const user = await requirePageRole(["OWNER", "ADMIN"], "/owner");
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Your restaurants</h1>
      <p>Arrives in Phase 6 (docs/08).</p>
    </main>
  );
}
