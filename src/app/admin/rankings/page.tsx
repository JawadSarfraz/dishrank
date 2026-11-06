import { AdminHeader, AdminList } from "@/components/admin/AdminPage";
import { EndEarlyRankingsButton, RecomputeButton } from "@/components/admin/RankingsControls";
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
  sessions?: number;
  error?: string;
};

export default async function AdminRankingsPage() {
  const user = await requirePageRole("ADMIN", "/admin/rankings");
  if (!user) return <Forbidden />;
  const { runs, cities } = await getRankingsAdmin(user);

  return (
    <main className="flex flex-col gap-6">
      <AdminHeader title="Rankings" />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Nightly recompute</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Runs every night at 02:00 PKT: trust, city averages, every rated row with decay, stale
          marking, re-rank of every list, the Sunday snapshot, expired sessions and rate-limit
          cleanup (docs/04).
        </p>
        <RecomputeButton />
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <AdminList>
            {runs.map((run) => {
              const s = (run.summary ?? {}) as RunSummary;
              const seconds =
                run.finishedAt &&
                Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 100) / 10;
              return (
                <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-medium">{dateTime.format(run.startedAt)}</span>
                  <Badge
                    variant={run.ok ? "default" : run.ok === null ? "secondary" : "destructive"}
                  >
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
                  {s.sessions ? <span>{s.sessions} sessions cleaned</span> : null}
                  {s.error && <span className="w-full text-destructive">{s.error}</span>}
                </li>
              );
            })}
          </AdminList>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Early rankings</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A city starts in early rankings: its pages say &quot;Early rankings&quot; and a rank needs{" "}
          {RANKING.bootstrap.minRaters} raters and weight {RANKING.bootstrap.minWeight} instead of{" "}
          {RANKING.normal.minRaters} and {RANKING.normal.minWeight.toFixed(1)}. That lasts until you
          end it. The button starts nothing: going live is separate. It sets the end,{" "}
          {RANKING.bootstrapDays} days later, and can be pressed once.
        </p>
        <AdminList>
          {cities.map((c) => (
            <li
              key={c.slug}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {!c.launchedAt
                    ? "Early rankings, no end date"
                    : c.mode === "bootstrap"
                      ? `Early rankings end on ${date.format(c.bootstrapEndsAt!)}`
                      : `Early rankings ended on ${date.format(c.bootstrapEndsAt!)}`}
                </span>
              </div>
              {c.launchedAt ? (
                <Badge variant="secondary">{c.mode === "bootstrap" ? "early" : "normal"}</Badge>
              ) : (
                <EndEarlyRankingsButton
                  city={c.slug}
                  name={c.name}
                  days={RANKING.bootstrapDays}
                  endsOn={date.format(c.wouldEndOn)}
                  rankedNow={c.rankedNow}
                  stillRanked={c.stillRankedUnderNormalRules}
                  normalRule={`${RANKING.normal.minRaters} raters and weight ${RANKING.normal.minWeight.toFixed(1)}`}
                />
              )}
            </li>
          ))}
        </AdminList>
      </section>
    </main>
  );
}
