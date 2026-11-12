// One place in a dish page's lists (spec §4, Contender row): the name and its area (a link to the
// restaurant page), and the Rate pill into the rate flow at the score step. Long names wrap, never
// truncate. Server-safe: the client lists (Contenders) render it too.
import Link from "next/link";
import { cn } from "cn";
import { ButtonLink } from "@/components/ui/button-link";

/** The rate flow at the score step for this place and dish. */
export const rateHrefOf = (citySlug: string, restaurantSlug: string, dishSlug: string) =>
  `/rate?city=${citySlug}&r=${restaurantSlug}&d=${dishSlug}`;

/** "2 more raters and it ranks" (spec §4): what a place with votes still needs, in raters. */
export function stillNeeds(votes: number, minRaters: number, ranksNext: boolean) {
  if (ranksNext) return "ranks at the next update";
  const left = minRaters - votes;
  // Enough raters but not enough weight (new accounts count less, docs/04): no honest number.
  if (left <= 0) return "a few more ratings and it ranks";
  return `${left} more rater${left === 1 ? "" : "s"} and it ranks`;
}

export function PlaceRow({
  href,
  rateHref,
  name,
  detail,
  className,
}: {
  href: string;
  rateHref: string;
  name: string;
  /** The muted second line: the area, and on ranked pages the progress. */
  detail?: string;
  className?: string;
}) {
  return (
    <li className={cn("flex min-h-17 items-center gap-3 py-2.5 pr-3 pl-4", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Only the name is the link, so its accessible name is the place's name alone; its tap
            area reaches 44 px through ::after without growing the row. */}
        <Link
          href={href}
          prefetch={false}
          className="relative w-fit max-w-full rounded-sm after:absolute after:inset-x-0 after:-inset-y-[11px] text-base leading-[22px] font-bold break-anywhere underline-offset-2 hover:underline"
        >
          {name}
        </Link>
        {detail && (
          <span className="text-[13px] leading-[18px] text-muted-foreground">{detail}</span>
        )}
      </div>
      <ButtonLink
        variant="pill"
        size="pill"
        href={rateHref}
        prefetch={false}
        aria-label={`Rate ${name}`}
      >
        Rate
      </ButtonLink>
    </li>
  );
}

/** A list's header (spec §5): the title, its count on the right, and one muted line under it. */
export function ListHeader({
  id,
  title,
  count,
  note,
  size = "section",
}: {
  id: string;
  title: string;
  count?: string;
  note?: React.ReactNode;
  /** "section": 24 / 28 ("Contenders", "Full ranking"); "sub": 20 / 24 ("Still need votes"). */
  size?: "section" | "sub";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id={id}
          className={cn(
            "font-display font-extrabold",
            size === "section" ? "text-2xl leading-7 tracking-[-0.01em]" : "text-xl leading-6",
          )}
        >
          {title}
        </h2>
        {count && (
          <span className="shrink-0 text-sm font-semibold text-muted-foreground">{count}</span>
        )}
      </div>
      {note && <p className="text-[13px] leading-[18px] text-muted-foreground">{note}</p>}
    </div>
  );
}

/** The 44 px filter controls above a list (spec §5: area select, "Near me"). */
export const CONTROL_SELECT =
  "field field-select h-11 min-h-11 rounded-control text-base font-semibold";
export const CONTROL_BUTTON =
  "h-11 rounded-control border-[1.5px] border-line-strong bg-card px-3.5 text-[15px] font-semibold text-ink hover:bg-sand";
