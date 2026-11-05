// "Not enough votes yet" (docs/04): the rows that are collecting votes, as an invitation to rate.
// Server component; each row shows how far it is from a rank and a Rate button that deep-links
// into the rate flow at the score step.
import Link from "next/link";
import { formatNeeded, formatVotes } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button-link";

export type WaitingRow = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  votes: number;
  ratingsNeeded: number;
};

export function WaitingList({
  rows,
  citySlug,
  dishSlug,
  dishName,
  minRaters,
  leadIn,
}: {
  rows: WaitingRow[];
  citySlug: string;
  dishSlug: string;
  dishName: string;
  minRaters: number;
  /** True when nothing ranks yet: this list is the page's main content. */
  leadIn: boolean;
}) {
  return (
    <section aria-labelledby="not-enough" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="not-enough" className="text-xl font-bold">
          Not enough votes yet
        </h2>
        <p className="text-sm text-muted-foreground">
          {leadIn
            ? `Your rating can put the first ${dishName} on the list.`
            : "Your rating can put these on the list."}
        </p>
      </div>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
        {rows.map((row) => {
          const share = Math.min(1, row.votes / Math.max(minRaters, 1));
          return (
            <li key={row.id} className="flex flex-col gap-2 px-3 py-3 sm:px-4">
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    href={`/${citySlug}/r/${row.slug}`}
                    className="inline-flex min-h-11 items-center font-display text-lg leading-tight font-bold break-anywhere underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {[
                      row.area,
                      row.votes > 0 ? formatVotes(row.votes) : "No votes yet",
                      formatNeeded(row.ratingsNeeded),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <ButtonLink
                  variant="secondary"
                  href={`/rate?city=${citySlug}&r=${row.slug}&d=${dishSlug}`}
                  className="shrink-0"
                >
                  Rate
                </ButtonLink>
              </div>
              <div
                role="progressbar"
                aria-label={`${row.votes} of ${minRaters} raters`}
                aria-valuemin={0}
                aria-valuemax={minRaters}
                aria-valuenow={Math.min(row.votes, minRaters)}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
