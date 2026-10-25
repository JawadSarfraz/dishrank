import Link from "next/link";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePageRole } from "@/server/auth";
import { listRestaurantsForAdmin } from "@/server/services/restaurant.service";
import { adminRestaurantListQuery } from "@/server/validation";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";
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
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Restaurants</h1>
        <Link href="/admin/restaurants/new" className="text-sm underline">
          Add restaurant
        </Link>
      </div>
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="flex flex-col gap-1 text-sm">
          Name or slug
          <Input name="q" defaultValue={query.q ?? ""} maxLength={80} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          City
          <select name="city" defaultValue={query.city ?? ""} className={selectClass}>
            <option value="">All</option>
            <option value="islamabad">Islamabad</option>
            <option value="rawalpindi">Rawalpindi</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select name="status" defaultValue={query.status ?? ""} className={selectClass}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {total} restaurants · page {page} of {pages}
      </p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/restaurants/${r.id}`} className="font-medium underline">
                {r.name}
              </Link>
              {r.status !== "ACTIVE" && <Badge variant="outline">{r.status}</Badge>}
            </div>
            <span className="text-muted-foreground">
              {r.area?.name ?? "no area"}, {r.city.name} · {r._count.dishes} dishes ·{" "}
              {r.source === "OVERTURE" ? "from Overture" : "added by hand"} ·{" "}
              {r.lat === null ? "no location" : "location set"} · {r.slug}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="p-3 text-sm">No restaurants match.</li>}
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
