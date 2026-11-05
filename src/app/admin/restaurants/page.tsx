import Link from "next/link";
import { AdminHeader, AdminList } from "@/components/admin/AdminPage";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { RemoveOwnerDialog } from "@/components/admin/RestaurantForms";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { requirePageRole } from "@/server/auth";
import { listRestaurantsForAdmin } from "@/server/services/restaurant.service";
import { adminRestaurantListQuery } from "@/server/validation";

const STATUSES = ["ACTIVE", "CLOSED", "HIDDEN", "DUPLICATE"] as const;

export default async function AdminRestaurantsPage({
  searchParams,
}: PageProps<"/admin/restaurants">) {
  const user = await requirePageRole("ADMIN", "/admin/restaurants");
  if (!user) return <Forbidden />;

  const parsed = adminRestaurantListQuery.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1 };
  const { items, total, page, pages } = await listRestaurantsForAdmin(user, query);

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.city) params.set("city", query.city);
    if (query.status) params.set("status", query.status);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/restaurants?${qs}` : "/admin/restaurants";
  };

  return (
    <main className="flex flex-col gap-5">
      <AdminHeader
        title="Restaurants"
        actions={
          <ButtonLink href="/admin/restaurants/new" size="sm">
            Add restaurant
          </ButtonLink>
        }
      />
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name or slug
          <Input
            name="q"
            defaultValue={query.q ?? ""}
            maxLength={80}
            className="h-10 w-56 max-w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          City
          <select
            name="city"
            defaultValue={query.city ?? ""}
            className="field field-select h-10 w-auto text-sm"
          >
            <option value="">All</option>
            <option value="islamabad">Islamabad</option>
            <option value="rawalpindi">Rawalpindi</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="field field-select h-10 w-auto text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {total} restaurants · page {page} of {pages}
      </p>
      <AdminList>
        {items.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/restaurants/${r.id}`}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {r.name}
              </Link>
              {r.status !== "ACTIVE" && <Badge variant="outline">{r.status}</Badge>}
            </div>
            <span className="text-muted-foreground">
              {r.area?.name ?? "no area"}, {r.city.name} · {r._count.dishes} dishes ·{" "}
              {r.source === "OVERTURE" ? "from Overture" : "added by hand"} ·{" "}
              {r.lat === null ? "no location" : "location set"} · {r.slug}
            </span>
            {r.claimedBy && (
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Owner: {r.claimedBy.name} ({r.claimedBy.email})
                </span>
                <RemoveOwnerDialog
                  restaurant={{ id: r.id, name: r.name }}
                  owner={{ id: r.claimedBy.id, name: r.claimedBy.name }}
                />
              </div>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-4 py-4 text-muted-foreground">No restaurants match.</li>
        )}
      </AdminList>
      <AdminPagination page={page} pages={pages} href={href} />
    </main>
  );
}
