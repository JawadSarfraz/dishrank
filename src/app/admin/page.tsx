import Link from "next/link";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getAdminOverview } from "@/server/services/admin.service";

const dateTime = new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});

export default async function AdminOverviewPage() {
  const user = await requirePageRole("ADMIN", "/admin");
  if (!user) return <Forbidden />;

  const o = await getAdminOverview(user);
  const restaurants = o.restaurantsByStatus;
  const run = o.lastRecompute;
  const pages = [
    {
      href: "/admin/import",
      label: "Import",
      detail: `${o.newCandidates} Overture candidate${o.newCandidates === 1 ? "" : "s"} to review`,
    },
    {
      href: "/admin/restaurants",
      label: "Restaurants",
      detail: `${restaurants.ACTIVE ?? 0} active · ${restaurants.CLOSED ?? 0} closed · ${restaurants.HIDDEN ?? 0} hidden`,
    },
    {
      href: "/admin/review",
      label: "Review queue",
      detail: `${o.openReviewItems} open item${o.openReviewItems === 1 ? "" : "s"}`,
    },
    {
      href: "/admin/menus",
      label: "Menus",
      detail: `${o.menusByStatus.PENDING ?? 0} waiting to be read · ${o.menusByStatus.PARSED ?? 0} to review · ${o.menusByStatus.FAILED ?? 0} failed`,
    },
    {
      href: "/admin/users",
      label: "Users",
      detail: `${o.usersByRole.USER} users · ${o.usersByRole.OWNER} owners · ${o.usersByRole.ADMIN} admins`,
    },
    {
      href: "/admin/rankings",
      label: "Rankings",
      detail: run
        ? `Last recompute ${dateTime.format(run.startedAt)}: ${run.ok === null ? "running" : run.ok ? "ok" : "failed"}`
        : "No recompute yet",
    },
  ];

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      <ul className="flex flex-col divide-y rounded-lg border">
        {pages.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="flex min-h-11 flex-col justify-center px-3 py-2 hover:bg-muted/50"
            >
              <span className="font-medium underline">{p.label}</span>
              <span className="text-sm text-muted-foreground">{p.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
