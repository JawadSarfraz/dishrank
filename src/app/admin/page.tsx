import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { AdminHeader, AdminList } from "@/components/admin/AdminPage";
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
      count: o.newCandidates,
      detail: `Overture candidate${o.newCandidates === 1 ? "" : "s"} to review`,
    },
    {
      href: "/admin/review",
      label: "Review queue",
      count: o.openReviewItems,
      detail: `open item${o.openReviewItems === 1 ? "" : "s"}`,
    },
    {
      href: "/admin/review?type=SUSPICIOUS_RATINGS",
      label: "Held ratings",
      count: o.heldRatings,
      detail: `rating${o.heldRatings === 1 ? "" : "s"} waiting for a check; held ratings do not count`,
    },
    {
      href: "/admin/menus",
      label: "Menus",
      count: (o.menusByStatus.PENDING ?? 0) + (o.menusByStatus.PARSED ?? 0),
      detail: `${o.menusByStatus.PENDING ?? 0} waiting to be read · ${o.menusByStatus.PARSED ?? 0} to review · ${o.menusByStatus.FAILED ?? 0} failed`,
    },
    {
      href: "/admin/restaurants",
      label: "Restaurants",
      count: restaurants.ACTIVE ?? 0,
      detail: `active · ${restaurants.CLOSED ?? 0} closed · ${restaurants.HIDDEN ?? 0} hidden`,
    },
    {
      href: "/admin/users",
      label: "Users",
      count: o.usersByRole.USER + o.usersByRole.OWNER + o.usersByRole.ADMIN,
      detail: `${o.usersByRole.USER} users · ${o.usersByRole.OWNER} owners · ${o.usersByRole.ADMIN} admins`,
    },
    {
      href: "/admin/rankings",
      label: "Rankings",
      count: null,
      detail: run
        ? `Last recompute ${dateTime.format(run.startedAt)}: ${run.ok === null ? "running" : run.ok ? "ok" : "failed"}`
        : "No recompute yet",
    },
    {
      href: "/admin/analytics",
      label: "Analytics",
      count: null,
      detail: "Ratings, raters, views, share clicks and sign-ins per week (no accounts)",
    },
  ];

  return (
    <main className="flex flex-col gap-5">
      <AdminHeader title="Admin" help="What needs a decision today, and where to find it." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {pages.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="flex h-full min-h-24 items-start gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-brand/40"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-display text-lg font-bold">{p.label}</span>
                <span className="text-sm text-muted-foreground">
                  {p.count !== null && (
                    <span className="font-display text-2xl font-extrabold text-foreground tabular-nums">
                      {p.count}{" "}
                    </span>
                  )}
                  {p.detail}
                </span>
              </span>
              <ChevronRightIcon
                aria-hidden="true"
                className="mt-1 size-5 shrink-0 text-muted-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="server-errors" className="flex flex-col gap-2">
        <h2 id="server-errors" className="text-lg font-bold">
          Server errors
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          The last 50 unexpected errors, kept for 30 days: the route, the error and its digest, no
          personal data. The digest finds the full story in the Vercel log, which keeps an hour.
        </p>
        <AdminList>
          {o.serverErrors.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2">
              <span className="font-medium break-anywhere">
                {e.route} · {e.name}
              </span>
              <span className="break-anywhere">{e.message}</span>
              <span className="text-muted-foreground">
                {dateTime.format(e.createdAt)}
                {e.digest ? ` · digest ${e.digest}` : ""}
              </span>
            </li>
          ))}
          {o.serverErrors.length === 0 && (
            <li className="px-4 py-4 text-muted-foreground">No server errors. Good.</li>
          )}
        </AdminList>
      </section>
    </main>
  );
}
