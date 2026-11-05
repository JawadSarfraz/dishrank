import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { AdminHeader, AdminList, AdminNote } from "@/components/admin/AdminPage";
import { AutoListApply } from "@/components/admin/AutoListApply";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { previewAutoList } from "@/server/services/auto-list.service";

const dateTime = new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});

const section = "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card";

function Counts({ rows }: { rows: { name: string; count: number }[] }) {
  return (
    <AdminList>
      {rows.map((row) => (
        <li key={row.name} className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="min-w-0 break-anywhere">{row.name}</span>
          <span className="font-medium tabular-nums">{row.count}</span>
        </li>
      ))}
    </AdminList>
  );
}

export default async function AutoListPage() {
  const user = await requirePageRole("ADMIN", "/admin/import/auto-list");
  if (!user) return <Forbidden />;
  const p = await previewAutoList(user);

  return (
    <main className="flex flex-col gap-5">
      <Link
        href="/admin/import"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" /> Import
      </Link>
      <AdminHeader
        title="Auto-list"
        help={
          <>
            A dry run: nothing has changed yet. Apply creates these as public restaurants (source
            OVERTURE), marks their candidates CREATED and links a dish only where the name or
            category clearly says so. Every other candidate stays NEW on the import page. It is safe
            to run again: it never changes a restaurant that exists, and it finds nothing it already
            did. Nothing here gives a score: a place ranks only from ratings on this site.
          </>
        }
      />

      <section className={section} aria-label="What Apply would do">
        <p className="text-sm">
          <span className="font-display text-3xl font-extrabold tabular-nums">{p.toCreate}</span>{" "}
          restaurants to create from {p.newCandidates} NEW candidates
          {p.release ? ` (release ${p.release})` : ""}. {p.dishLinks} dish links on {p.withDishLink}{" "}
          of them. {p.renamedCount} names tidied.
        </p>
        <AutoListApply toCreate={p.toCreate} />
      </section>

      {p.runs.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Earlier runs">
          <h2 className="text-lg font-bold">Earlier runs</h2>
          <AdminList>
            {p.runs.map((r) => (
              <li key={r.id} className="px-4 py-2">
                {dateTime.format(r.startedAt)}: {r.summary?.created ?? 0} created,{" "}
                {r.summary?.remaining ?? 0} left
                {r.summary?.failed ? `, ${r.summary.failed} failed` : ""}
                {r.ok === null ? " (did not finish)" : ""}
              </li>
            ))}
          </AdminList>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-label="Confidence">
        <h2 className="text-lg font-bold">Overture confidence (floor {p.floor})</h2>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">
                  Confidence
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  NEW
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  With area and location
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Would be listed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {p.bands.map((b) => (
                <tr key={b.from} className={b.from < p.floor ? "text-muted-foreground" : ""}>
                  <td className="px-4 py-2 tabular-nums">
                    {b.from.toFixed(1)}–{b.to.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.all}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.withAreaAndLocation}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{b.listed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Staying NEW">
        <h2 className="text-lg font-bold">Staying NEW, and why</h2>
        <Counts rows={p.held.map((h) => ({ name: h.label, count: h.count }))} />
      </section>

      {p.cities.map((city) => (
        <section key={city.name} className="flex flex-col gap-2" aria-label={city.name}>
          <h2 className="text-lg font-bold">
            {city.name}: {city.count}
          </h2>
          {city.areas.length > 0 ? (
            <Counts rows={city.areas} />
          ) : (
            <AdminNote>Nothing to create here.</AdminNote>
          )}
        </section>
      ))}

      <section className="flex flex-col gap-2" aria-label="Categories">
        <h2 className="text-lg font-bold">By category</h2>
        <Counts rows={p.categories} />
      </section>

      <section className="flex flex-col gap-2" aria-label="Dish links">
        <h2 className="text-lg font-bold">Dish links</h2>
        <Counts rows={p.dishes} />
      </section>

      <section className="flex flex-col gap-2" aria-label="Tidied names">
        <h2 className="text-lg font-bold">
          Tidied names ({Math.min(p.renamed.length, p.renamedCount)} of {p.renamedCount})
        </h2>
        <AdminList>
          {p.renamed.map((r) => (
            <li key={r.from} className="flex flex-col px-4 py-2">
              <span className="text-muted-foreground break-anywhere">{r.from}</span>
              <span className="font-medium break-anywhere">{r.to}</span>
            </li>
          ))}
        </AdminList>
      </section>

      {p.heldByName.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Held back by their name">
          <h2 className="text-lg font-bold">Held back by their name</h2>
          <AdminList>
            {p.heldByName.map((h) => (
              <li key={h.id} className="flex flex-col px-4 py-2">
                <span className="font-medium break-anywhere">{h.name}</span>
                <span className="text-muted-foreground">{h.label}</span>
              </li>
            ))}
          </AdminList>
        </section>
      )}
    </main>
  );
}
