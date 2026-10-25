import Link from "next/link";
import { PanelToggle } from "@/components/admin/PanelToggle";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePageRole } from "@/server/auth";
import { listUsersForAdmin } from "@/server/services/admin-users.service";
import { adminUserListQuery } from "@/server/validation";

const date = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requirePageRole("ADMIN", "/admin/users");
  if (!user) return <Forbidden />;

  const parsed = adminUserListQuery.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1 };
  const { items, total, page, pages } = await listUsersForAdmin(user, query);
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.panel) params.set("panel", query.panel);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <p className="text-sm">
        Panel members are trusted early raters: trust fixed at 1.3, 30 ratings a day and 10 per
        restaurant, never held by the new-account burst rule, still blocked from their own
        restaurants (docs/04). Turning the panel off returns trust to the docs/04 table.
      </p>
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="flex flex-col gap-1 text-sm">
          Email or name
          <Input name="q" defaultValue={query.q ?? ""} maxLength={120} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="panel"
            value="only"
            defaultChecked={query.panel === "only"}
          />
          Panel only
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {total} users · page {page} of {pages}
      </p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div className="flex flex-col">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {u.name}
                {u.isPanel && <Badge>Panel</Badge>}
                {u.role !== "USER" && <Badge variant="outline">{u.role}</Badge>}
                {u.bannedAt && <Badge variant="destructive">Banned</Badge>}
              </span>
              <span className="text-muted-foreground">
                {u.email} · trust {u.trustScore.toFixed(1)} · {u.ratingsCount} ratings · joined{" "}
                {date.format(u.createdAt)}
              </span>
            </div>
            <PanelToggle userId={u.id} isPanel={u.isPanel} name={u.name} />
          </li>
        ))}
        {items.length === 0 && <li className="p-3 text-sm">No users match.</li>}
      </ul>
      <nav aria-label="Pages" className="flex gap-4 text-sm">
        {page > 1 && (
          <Link href={href(page - 1)} className="underline">
            Previous
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className="underline">
            Next
          </Link>
        )}
      </nav>
    </main>
  );
}
