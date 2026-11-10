import { AdminHeader } from "@/components/admin/AdminPage";
import { ContenderCuration } from "@/components/admin/ContenderCuration";
import { Forbidden } from "@/components/auth/Forbidden";
import { Button } from "@/components/ui/button";
import { requirePageRole } from "@/server/auth";
import { getContendersAdmin } from "@/server/services/contenders.service";
import { contenderQuery } from "@/server/validation";

const selectClass = "field field-select h-11 w-auto min-w-0 font-medium";

/** Curating one dish's list in one city (docs/01 D2a): the fastest path to a list that looks right. */
export default async function AdminContendersPage({
  searchParams,
}: PageProps<"/admin/contenders">) {
  const user = await requirePageRole("ADMIN", "/admin/contenders");
  if (!user) return <Forbidden />;
  const parsed = contenderQuery.safeParse(await searchParams);
  const data = await getContendersAdmin(user, parsed.success ? parsed.data : {});

  return (
    <main className="flex flex-col gap-5">
      <AdminHeader
        title="Contenders"
        help="A dish page lists a place only when it ranks, has a counted rating, or you checked its listing. Adding a place here ticks the dish and marks the listing checked. Removing takes the dish off the place: it leaves the list and the ranking, keeps its ratings, and can come back."
      />
      <form method="get" className="flex flex-wrap items-end gap-2" aria-label="City and dish">
        <label className="flex flex-col gap-1 text-sm font-medium">
          City
          <select name="city" defaultValue={data.city.slug} className={selectClass}>
            {data.cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Dish
          <select name="dish" defaultValue={data.dish.slug} className={selectClass}>
            {data.dishes.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>
      <ContenderCuration
        key={`${data.city.slug}:${data.dish.slug}`}
        city={data.city}
        dish={data.dish}
        dishes={data.dishes}
        contenders={data.contenders}
        hidden={data.hidden}
        removed={data.removed}
      />
    </main>
  );
}
