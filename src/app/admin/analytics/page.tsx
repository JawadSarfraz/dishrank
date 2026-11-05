import { AdminHeader } from "@/components/admin/AdminPage";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { getAnalyticsAdmin } from "@/server/services/analytics.service";

const day = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "UTC" });

function TopPages({
  title,
  rows,
}: {
  title: string;
  rows: { citySlug: string | null; dishSlug: string | null; views: number }[];
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-card">
      <h2 className="text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No views yet.</p>
      ) : (
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
          {rows.map((r) => (
            <li key={`${r.citySlug}/${r.dishSlug}`}>
              /{r.citySlug}/best-{r.dishSlug}: <span className="tabular-nums">{r.views}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function AdminAnalyticsPage() {
  const user = await requirePageRole("ADMIN", "/admin/analytics");
  if (!user) return <Forbidden />;

  const data = await getAnalyticsAdmin(user);
  return (
    <main className="flex flex-col gap-5">
      <AdminHeader
        title="Analytics"
        help="Counted per day with the city and dish only: no account, no IP address, no search text and no third-party tracker. Weeks start on Monday (Pakistan time)."
      />
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th scope="col" className="px-4 py-2 font-medium">
                Week of
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Ratings
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Searches
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Ranking views
              </th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.week.toISOString()} className="border-b last:border-0">
                <td className="px-4 py-2">{day.format(w.week)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{w.ratings}</td>
                <td className="px-4 py-2 text-right tabular-nums">{w.searches}</td>
                <td className="px-4 py-2 text-right tabular-nums">{w.rankingViews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TopPages title="Most viewed this week" rows={data.thisWeek} />
        <TopPages title="Most viewed, last 4 weeks" rows={data.lastFourWeeks} />
      </div>
    </main>
  );
}
