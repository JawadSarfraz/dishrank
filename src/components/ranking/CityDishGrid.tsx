// The dish grid of a city (server component): each dish links to its ranking page and shows the
// one ranked first with its score and votes, or how many contenders wait for the first votes.
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { DishIcon } from "@/components/brand/DishIcon";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import type { CityDish } from "@/server/services/city-page.service";

export function CityDishGrid({ citySlug, dishes }: { citySlug: string; dishes: CityDish[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3">
      {dishes.map((d) => (
        <li key={d.slug} className="min-w-0">
          <Link
            href={`/${citySlug}/best-${d.slug}`}
            className="flex h-full min-h-32 flex-col gap-2 rounded-xl border bg-card p-3 shadow-card transition-colors hover:border-brand/40 active:bg-muted"
          >
            <DishIcon slug={d.slug} size={26} className="text-brand" />
            <span className="font-display text-lg leading-tight font-bold break-anywhere">
              {d.name}
            </span>
            {d.top ? (
              <span className="mt-auto flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-sm">
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
              <span className="mt-auto flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  {d.contenders > 0
                    ? `${d.contenders} contender${d.contenders === 1 ? "" : "s"} · Voting is open`
                    : "We're picking the contenders"}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-brand">
                  Rate one you know <ArrowRightIcon className="size-4" aria-hidden="true" />
                </span>
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
