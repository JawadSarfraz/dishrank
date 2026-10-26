import { LaunchCityButton, RecomputeButton } from "@/components/admin/RankingsControls";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { requirePageRole } from "@/server/auth";
import { getRankingsAdmin } from "@/server/services/admin-rankings.service";
import { RANKING } from "@/server/services/ranking.constants";

// "Recompute now" runs the whole nightly job inside this page's server action.
export const maxDuration = 300;

const dateTime = new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});
const date = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

type RunSummary = {
  trigger?: string;
  rows?: { recomputed?: number; failed?: number };
  stale?: number;
  trust?: { changed?: number };
  snapshots?: number;
  error?: string;
};

export default async function AdminRankingsPage() {
  const user = await requirePageRole("ADMIN", "/admin/rankings");
  if (!user) return <Forbidden />;
  const { runs, cities } = await getRankingsAdmin(user);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Rankings</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Nightly recompute</h2>
        <p className="text-sm">
          Runs every night at 02:00 PKT: trust, city averages, every rated row with decay, stale
          marking, re-rank of every list, the Sunday snapshot and rate-limit cleanup (docs/04).
        </p>
        <RecomputeButton />
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {runs.map((run) => {
              const s = (run.summary ?? {}) as RunSummary;
              const seconds =
                run.finishedAt &&
                Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 100) / 10;
              return (
                <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <span className="font-medium">{dateTime.format(run.startedAt)}</span>
                  <Badge variant={run.ok ? "secondary" : "destructive"}>
                    {run.ok === null ? "running" : run.ok ? "ok" : "failed"}
                  </Badge>
                  {s.trigger && <span>{s.trigger}</span>}
                  {seconds !== null && <span>{seconds} s</span>}
                  {s.rows && (
                    <span>
                      {s.rows.recomputed ?? 0} rows
                      {s.rows.failed ? `, ${s.rows.failed} failed` : ""}
                    </span>
                  )}
                  {s.stale !== undefined && <span>{s.stale} stale</span>}
                  {s.trust && <span>{s.trust.changed ?? 0} trust changes</span>}
                  {s.snapshots ? <span>{s.snapshots} snapshots</span> : null}
                  {s.error && <span className="w-full text-destructive">{s.error}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">City launch</h2>
        <p className="text-sm">
          Until a city is launched, and for {RANKING.bootstrapDays} days after, its pages say
          &quot;Early rankings&quot; and a rank needs {RANKING.bootstrap.minRaters} raters and
          weight {RANKING.bootstrap.minWeight} instead of {RANKING.normal.minRaters} and{" "}
          {RANKING.normal.minWeight.toFixed(1)}. The launch date is set once.
        </p>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {cities.map((c) => (
            <li key={c.slug} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {c.launchedAt
                    ? `Launched ${date.format(c.launchedAt)} · early rankings until ${date.format(c.bootstrapEndsAt!)}`
                    : "Not launched · early rankings"}
                </span>
              </div>
              {c.launchedAt ? (
                <Badge variant="secondary">{c.mode === "bootstrap" ? "early" : "normal"}</Badge>
              ) : (
                <LaunchCityButton city={c.slug} name={c.name} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
