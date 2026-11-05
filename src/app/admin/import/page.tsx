import { AdminHeader, AdminTabs } from "@/components/admin/AdminPage";
import { ImportQueue } from "@/components/admin/ImportQueue";
import { Forbidden } from "@/components/auth/Forbidden";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { requirePageRole } from "@/server/auth";
import { QUEUE_LIMIT, getImportQueue } from "@/server/services/import.service";
import { importQueueQuery } from "@/server/validation";

export default async function AdminImportPage({ searchParams }: PageProps<"/admin/import">) {
  const user = await requirePageRole("ADMIN", "/admin/import");
  if (!user) return <Forbidden />;

  const parsed = importQueueQuery.safeParse(await searchParams);
  const queue = await getImportQueue(user, parsed.success ? parsed.data : {});
  const areaValue = queue.area?.slug ?? "none";

  return (
    <main className="flex flex-col gap-5">
      <AdminHeader
        title="Import"
        actions={
          <ButtonLink href="/admin/import/auto-list" size="sm">
            Auto-list
          </ButtonLink>
        }
        help={
          <>
            Places from Overture Maps (Meta and Microsoft records
            {queue.release ? `, release ${queue.release}` : ""}), one area at a time, most likely to
            exist first. Auto-list creates the clear ones in one go, after a preview. For the rest:
            Create a restaurant (the form is prefilled; fix the name to the signboard spelling and
            tick its dishes), Link it to one we have, or Skip it. Nothing is public until it is
            created. Load new places with{" "}
            <code className="rounded bg-muted px-1">pnpm overture:sync -- --city=all</code>.
          </>
        }
      />
      <AdminTabs
        label="City"
        items={queue.cities.map((c) => ({
          href: `/admin/import?city=${c.slug}`,
          label: c.name,
          active: c.slug === queue.city.slug,
        }))}
      />
      <form className="flex flex-wrap items-end gap-3" key={`${queue.city.slug}:${areaValue}`}>
        <input type="hidden" name="city" value={queue.city.slug} />
        <label className="flex flex-col gap-1 text-sm font-medium">
          Area (places left to review)
          <select
            name="area"
            defaultValue={areaValue}
            className="field field-select h-10 w-auto text-sm"
          >
            {queue.areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} ({a.newCount})
              </option>
            ))}
            <option value="none">No area suggested ({queue.noAreaCount})</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Show
          <select
            name="show"
            defaultValue={queue.show}
            className="field field-select h-10 w-auto text-sm"
          >
            <option value="new">To review</option>
            <option value="skipped">Skipped</option>
            <option value="done">Created or linked</option>
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm">
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
