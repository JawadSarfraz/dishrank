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

type Week = Awaited<ReturnType<typeof getAnalyticsAdmin>>["weeks"][number];

function WeekTable({
  weeks,
  columns,
}: {
  weeks: Week[];
  columns: [label: string, value: (week: Week) => number][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th scope="col" className="px-4 py-2 font-medium">
              Week of
            </th>
            {columns.map(([label]) => (
              <th key={label} scope="col" className="px-4 py-2 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week.toISOString()} className="border-b last:border-0">
              <td className="px-4 py-2 whitespace-nowrap">{day.format(w.week)}</td>
              {columns.map(([label, value]) => (
                <td key={label} className="px-4 py-2 text-right tabular-nums">
                  {value(w)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        help="Counted per day with at most the city and dish: no account, no IP address, no search text and no third-party tracker. Raters are counted from the ratings themselves, as totals; returning raters also rated in an earlier week. Weeks start on Monday (Pakistan time)."
      />
      <WeekTable
        weeks={data.weeks}
        columns={[
          ["Ratings", (w) => w.ratings],
          ["Raters", (w) => w.raters],
          ["Returning raters", (w) => w.returningRaters],
          ["Searches", (w) => w.searches],
          ["Ranking views", (w) => w.rankingViews],
          ["Share clicks", (w) => w.shareClicks],
        ]}
      />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Sign-ins</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Google refuses its sign-in inside the Facebook, Instagram, Messenger and TikTok browsers.
          In-app reached: a sign-in step opened in one of them. Left: Open in Chrome or Copy link
          was tapped. Completed: the sign-in finished in Chrome or Safari after that.
        </p>
        <WeekTable
          weeks={data.weeks}
          columns={[
            ["Browser: started", (w) => w.signInStarted],
            ["Browser: completed", (w) => w.signInCompleted],
            ["In-app: reached", (w) => w.inAppStarted],
            ["In-app: left", (w) => w.inAppLeft],
            ["In-app: completed", (w) => w.inAppCompleted],
          ]}
        />
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <TopPages title="Most viewed this week" rows={data.thisWeek} />
        <TopPages title="Most viewed, last 4 weeks" rows={data.lastFourWeeks} />
      </div>
    </main>
  );
}
