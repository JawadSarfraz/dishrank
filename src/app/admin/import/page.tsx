import Link from "next/link";
import { ImportQueue } from "@/components/admin/ImportQueue";
import { Forbidden } from "@/components/auth/Forbidden";
import { Button } from "@/components/ui/button";
import { requirePageRole } from "@/server/auth";
import { QUEUE_LIMIT, getImportQueue } from "@/server/services/import.service";
import { importQueueQuery } from "@/server/validation";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

export default async function AdminImportPage({ searchParams }: PageProps<"/admin/import">) {
  const user = await requirePageRole("ADMIN", "/admin/import");
  if (!user) return <Forbidden />;

  const parsed = importQueueQuery.safeParse(await searchParams);
  const queue = await getImportQueue(user, parsed.success ? parsed.data : {});
  const areaValue = queue.area?.slug ?? "none";

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import</h1>
      <p className="text-sm">
        Places from Overture Maps (Meta and Microsoft records
        {queue.release ? `, release ${queue.release}` : ""}), one area at a time, most likely to
        exist first. For each: Create a restaurant (the form is prefilled; fix the name to the
        signboard spelling and tick its dishes), Link it to one we have, or Skip it. Nothing is
        public until you create it. Load new places with{" "}
        <code>pnpm overture:sync -- --city=all</code>.
      </p>

      <nav aria-label="City" className="flex gap-4 text-sm">
        {queue.cities.map((c) => (
          <Link
            key={c.slug}
            href={`/admin/import?city=${c.slug}`}
            aria-current={c.slug === queue.city.slug ? "page" : undefined}
            className={c.slug === queue.city.slug ? "font-semibold" : "underline"}
          >
            {c.name}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" key={`${queue.city.slug}:${areaValue}`}>
        <input type="hidden" name="city" value={queue.city.slug} />
        <label className="flex flex-col gap-1 text-sm">
          Area (places left to review)
          <select name="area" defaultValue={areaValue} className={selectClass}>
            {queue.areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} ({a.newCount})
              </option>
            ))}
            <option value="none">No area suggested ({queue.noAreaCount})</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Show
          <select name="show" defaultValue={queue.show} className={selectClass}>
            <option value="new">To review</option>
            <option value="skipped">Skipped</option>
            <option value="done">Created or linked</option>
          </select>
        </label>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {queue.area
          ? queue.area.name
          : "No area suggested (far from our area centres, or location unknown)"}
        , {queue.city.name}: {queue.total} {queue.total === 1 ? "place" : "places"}
        {queue.total > QUEUE_LIMIT ? ` (first ${QUEUE_LIMIT} shown)` : ""}.
      </p>
      <ImportQueue key={`${queue.city.slug}:${areaValue}:${queue.show}`} queue={queue} />
    </main>
  );
}
