// The restaurant page's dish rows (spec §4, "Restaurant dish row" and "Contender row"). Server-only
// markup, no client JS. A ranked dish is a card link to its ranking page with the no-photo tile
// (never a dish photo: next to a restaurant it would read as that place's own plate), the rater
// count, the score pill and the city-wide rank. A dish not ranked here yet is a contender-style row:
// its name links to the ranking page, its Rate pill to the rate flow for this place and dish.
import Link from "next/link";
import { DishMedia } from "@/components/dish/DishMedia";
import { RankDisc } from "@/components/ranking/RankDisc";
import { ScorePill } from "@/components/ranking/ScoreBadge";
import { ButtonLink } from "@/components/ui/button-link";
import { RowList } from "@/components/ui/kit";
import { formatFromPrice, formatNeeded } from "@/lib/format";

export type RestaurantDishRowData = {
  id: string;
  dish: { slug: string; name: string };
  votes: number;
  score: number | null;
  rankInCity: number | null;
  price: number | null;
  variantTags: string[];
};

/** "from Rs 1,850 · boneless": what the old rows showed under the name, kept. */
function extras(row: RestaurantDishRowData) {
  const parts = [row.price !== null ? formatFromPrice(row.price) : null, ...row.variantTags];
  const text = parts.filter(Boolean).join(" · ");
  return text ? (
    <span className="text-[13px] leading-[18px] break-anywhere text-muted-foreground">{text}</span>
  ) : null;
}

export function RankedDishRows({
  rows,
  dishHref,
  rankedInCity,
}: {
  rows: RestaurantDishRowData[];
  dishHref: (slug: string) => string;
  /** Places ranked for each dish in the city, by dish slug ("of 7"); missing when not known. */
  rankedInCity: Record<string, number>;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const rank = row.rankInCity!;
        const of = rankedInCity[row.dish.slug];
        return (
          <li key={row.id}>
            <Link
              href={dishHref(row.dish.slug)}
              className="pressable grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-card border bg-card p-3 text-ink shadow-card transition-shadow hover:shadow-card-hover"
            >
              <DishMedia
                slug={row.dish.slug}
                slot="row"
                allowPhoto={false}
                className="size-16 rounded-field"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-display text-[17px] leading-5 font-bold break-anywhere">
                  {row.dish.name}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] leading-5 text-muted-foreground">
                  <span className="font-display text-lg leading-5 font-extrabold text-ink tabular-nums">
                    {row.votes}
                  </span>
                  {row.votes === 1 ? "rater" : "raters"}
                  {row.score !== null && (
                    <>
                      <span className="sr-only">, score</span>
                      <ScorePill score={row.score} size="sm" />
                    </>
                  )}
                </span>
                {extras(row)}
              </span>
              <span className="flex min-w-11 flex-col items-center gap-0.5">
                <span className="sr-only">, rank</span>
                <RankDisc
                  rank={rank}
                  size="lg"
                  plain
                  className={rank === 1 ? "text-2xl" : "h-11 leading-[44px]"}
                />
                {of !== undefined && of >= rank && (
                  <span className="text-[11px] leading-[14px] font-semibold text-muted-foreground">
                    of {of}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What the row still needs. In raters only: the weight rule (docs/04) can ask for more, so the line
 * says what is needed, never "and it ranks" (same words as the ranking page's waiting rows).
 */
function progress(votes: number, minRaters: number | null) {
  if (votes === 0) return "Be the first to rate it here";
  if (minRaters === null) return "Collecting votes";
  const text = formatNeeded(votes, minRaters, false);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function UnrankedDishRows({
  rows,
  dishHref,
  rateHref,
  minRaters,
}: {
  rows: RestaurantDishRowData[];
  dishHref: (slug: string) => string;
  rateHref: (slug: string) => string;
  minRaters: number | null;
}) {
  return (
    <RowList>
      {rows.map((row) => (
        <li key={row.id} className="flex min-h-[68px] items-center gap-3 py-2.5 pr-3 pl-4">
          <Link
            href={dishHref(row.dish.slug)}
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-sm text-ink hover:underline hover:underline-offset-4"
          >
            <span className="text-base leading-[22px] font-bold break-anywhere">
              {row.dish.name}
            </span>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {progress(row.votes, minRaters)}
            </span>
            {extras(row)}
          </Link>
          <ButtonLink
            href={rateHref(row.dish.slug)}
            prefetch={false}
            variant="pill"
            size="pill"
            aria-label={`Rate ${row.dish.name} here`}
          >
            Rate
          </ButtonLink>
        </li>
      ))}
    </RowList>
  );
}
