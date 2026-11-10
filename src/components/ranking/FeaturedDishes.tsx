// The home and city pages lead with the featured dishes (docs/01 Home, 2026-11-11): one or two
// large cards, each the whole invitation for its dish, and the line that says when voting for the
// round's results closes (the ranking itself never closes). Server component.
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { DishIcon } from "@/components/brand/DishIcon";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import type { CityDish } from "@/server/services/city-page.service";
import { suggestPlacePath } from "@/lib/paths";

export function FeaturedDishes({
  citySlug,
  dishes,
  closingLine,
}: {
  citySlug: string;
  dishes: CityDish[];
  closingLine: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ul className={`grid gap-3 ${dishes.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {dishes.map((d) => (
          <li key={d.slug} className="min-w-0">
            <Link
              href={`/${citySlug}/best-${d.slug}`}
              className="flex h-full min-h-44 flex-col gap-3 rounded-2xl border-2 border-brand/30 bg-card p-4 shadow-card transition-colors hover:border-brand active:bg-muted sm:p-5"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <DishIcon slug={d.slug} size={28} />
              </span>
              <span className="font-display text-2xl leading-tight font-extrabold break-anywhere">
                {d.name}
              </span>
              {d.top ? (
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-base">
                    <span className="shrink-0 font-bold">#1</span>
                    <span className="min-w-0 truncate" title={d.top.name}>
                      {d.top.name}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <ScoreBadge score={d.top.score} votes={d.top.votes} size="sm" />
                    <span className="text-xs text-muted-foreground">
                      {d.ranked === 1 ? "1 ranked" : `${d.ranked} ranked`}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="text-base text-muted-foreground">
                  {d.contenders > 0
                    ? `${d.contenders} contender${d.contenders === 1 ? "" : "s"} · Voting is open`
                    : "We're picking the contenders"}
                </span>
              )}
              <span className="mt-auto inline-flex items-center gap-1 text-base font-semibold text-brand">
                {d.top ? "See the ranking and vote" : "Vote"}
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {closingLine && <p className="text-sm font-medium">{closingLine}</p>}
    </div>
  );
}

/** The dishes with no contenders yet: a compact group that asks for nominations, not votes. */
export function ComingNext({ citySlug, dishes }: { citySlug: string; dishes: CityDish[] }) {
  return (
    <section aria-labelledby="coming-next" className="flex flex-col gap-2">
      <h2 id="coming-next" className="text-xl font-bold">
        Coming next
      </h2>
      <p className="text-sm text-muted-foreground">
        <Link
          href={suggestPlacePath(citySlug)}
          prefetch={false}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Tell us which places should be on the list
        </Link>
        .
      </p>
      <ul className="flex flex-wrap gap-2">
        {dishes.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/${citySlug}/best-${d.slug}`}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <DishIcon slug={d.slug} size={18} className="text-brand" />
              {d.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
