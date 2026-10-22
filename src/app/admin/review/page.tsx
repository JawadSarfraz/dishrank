import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export default async function AdminReviewPage() {
  const user = await requirePageRole("ADMIN", "/admin/review");
  if (!user) return <Forbidden />;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Review queue</h1>
      <p>Arrives in Phase 5 (docs/08).</p>
    </main>
  );
}
