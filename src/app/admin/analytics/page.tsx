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
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm">No views yet.</p>
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
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="text-sm text-muted-foreground">
        Counted per day with the city and dish only: no account, no IP address, no search text and
        no third-party tracker. Weeks start on Monday (Pakistan time).
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="py-2 pr-2 font-semibold">
              Week of
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">
              Ratings
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">
              Searches
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Ranking views
            </th>
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((w) => (
            <tr key={w.week.toISOString()} className="border-b">
              <td className="py-2 pr-2">{day.format(w.week)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{w.ratings}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{w.searches}</td>
              <td className="py-2 text-right tabular-nums">{w.rankingViews}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-6 md:grid-cols-2">
        <TopPages title="Most viewed this week" rows={data.thisWeek} />
        <TopPages title="Most viewed, last 4 weeks" rows={data.lastFourWeeks} />
      </div>
    </main>
  );
}
