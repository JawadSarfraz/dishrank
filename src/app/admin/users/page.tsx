import { AdminHeader, AdminList } from "@/components/admin/AdminPage";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { PanelInvites } from "@/components/admin/PanelInvites";
import { PanelToggle } from "@/components/admin/PanelToggle";
import { TrustOverride } from "@/components/admin/TrustOverride";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePageRole } from "@/server/auth";
import { listUsersForAdmin } from "@/server/services/admin-users.service";
import { PANEL_INVITE, listPanelInvites } from "@/server/services/panel-invite.service";
import { adminUserListQuery } from "@/server/validation";

const date = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requirePageRole("ADMIN", "/admin/users");
  if (!user) return <Forbidden />;

  const parsed = adminUserListQuery.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1 };
  const [{ items, total, page, pages }, invites] = await Promise.all([
    listUsersForAdmin(user, query),
    listPanelInvites(user),
  ]);
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.panel) params.set("panel", query.panel);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <main className="flex flex-col gap-5">
      <AdminHeader
        title="Users"
        help="Panel members are trusted early raters: trust 1.3, 30 ratings a day and 10 per restaurant, never held by the new-account burst rule, still blocked from their own restaurants (docs/04). Turning the panel off returns trust to the docs/04 table. A trust set by hand (0.3 to 1.5) wins over both and the nightly job keeps it; Clear returns to the table."
      />
      <PanelInvites
        invites={invites}
        defaults={{ maxUses: PANEL_INVITE.maxUses, days: PANEL_INVITE.days }}
      />
      <h2 className="text-lg font-bold">Everyone</h2>
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email or name
          <Input
            name="q"
            defaultValue={query.q ?? ""}
            maxLength={120}
            className="h-10 w-64 max-w-full"
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="panel"
            value="only"
            defaultChecked={query.panel === "only"}
            className="size-4 accent-brand"
          />
          Panel only
        </label>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {total} users · page {page} of {pages}
      </p>
      <AdminList>
        {items.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {u.name}
                {u.isPanel && <Badge>Panel</Badge>}
                {u.role !== "USER" && <Badge variant="outline">{u.role}</Badge>}
                {u.bannedAt && <Badge variant="destructive">Banned</Badge>}
              </span>
              <span className="text-muted-foreground">
                {u.email} · trust {u.trustScore.toFixed(2)}
                {u.trustOverride !== null ? " (set by hand)" : ""} · {u.ratingsCount} ratings ·
                joined {date.format(u.createdAt)}
              </span>
            </div>
            <div className="flex flex-col items-end gap-2">
              <PanelToggle userId={u.id} isPanel={u.isPanel} name={u.name} />
              <TrustOverride userId={u.id} trustOverride={u.trustOverride} name={u.name} />
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-4 text-muted-foreground">No users match.</li>}
      </AdminList>
      <AdminPagination page={page} pages={pages} href={href} />
    </main>
  );
}
