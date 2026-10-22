import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getAdminOverview } from "@/server/services/admin.service";

export default async function AdminOverviewPage() {
  const user = await requirePageRole("ADMIN", "/admin");
  if (!user) return <Forbidden />;

  const { usersByRole } = await getAdminOverview(user);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p>
        Users: {usersByRole.USER} · Owners: {usersByRole.OWNER} · Admins: {usersByRole.ADMIN}
      </p>
    </main>
  );
}
