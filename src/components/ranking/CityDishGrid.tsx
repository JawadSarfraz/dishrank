// The dish cards of a city (spec §4 "Dish card"; server component). The whole card links to the
// dish's page. The photo, or the no-photo tile with the title on it, carries the count chip; the
// body says the state: voting open ("Rate one you know →", "N places") or ranked (the #1 place,
// "See the ranking →", "N ranked"). A count of zero is never shown (spec §3): a dish with neither
// is not on this grid (it is in "Coming next").
import Link from "next/link";
import { cn } from "cn";
import { DishMedia, hasDishPhoto } from "@/components/dish/DishMedia";
import { placesLabel } from "@/components/home/featured-copy";
import { CountChip, LiveDot, NumberOneChip } from "@/components/ui/kit";
import type { CityDish } from "@/server/services/city-page.service";

export function CityDishGrid({
  citySlug,
  dishes,
  phoneLimit,
  desktopLimit,
}: {
  citySlug: string;
  dishes: CityDish[];
  /** Cards after this many show from 1024 px up only (the home page). */
  phoneLimit?: number;
  /** At most this many cards (the home page); the city page shows them all. */
  desktopLimit?: number;
}) {
  const shown = desktopLimit === undefined ? dishes : dishes.slice(0, desktopLimit);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(250px,1fr))] lg:gap-6">
      {shown.map((d, i) => (
        <DishCard
          key={d.slug}
          citySlug={citySlug}
          dish={d}
          className={phoneLimit !== undefined && i >= phoneLimit ? "hidden lg:block" : undefined}
        />
      ))}
    </ul>
  );
}

function DishCard({
  citySlug,
  dish,
  className,
}: {
  citySlug: string;
  dish: CityDish;
  className?: string;
}) {
  const photo = hasDishPhoto(dish.slug);
  const chip = dish.top
    ? `${dish.ranked} ranked`
    : dish.contenders > 0
      ? placesLabel(dish.contenders)
      : null;
  const line = "text-[13px] leading-[18px] lg:text-sm lg:leading-5";
  return (
    <li className={cn("min-w-0", className)}>
      <Link
        href={`/${citySlug}/best-${dish.slug}`}
        className="pressable flex h-full flex-col overflow-hidden rounded-card border bg-card text-ink shadow-card transition-shadow hover:shadow-card-hover"
      >
        <DishMedia
          slug={dish.slug}
          slot="card"
          className={cn("h-28 shrink-0 lg:h-44", !photo && "p-3 text-white lg:p-4")}
        >
          {!photo && (
            <span className="relative block max-w-[124px] font-display text-xl leading-[22px] font-extrabold tracking-[-0.01em] break-words lg:max-w-[180px] lg:text-2xl lg:leading-[26px]">
              {dish.name}
            </span>
          )}
          {chip && (
            <CountChip
              onTile={!photo}
              className="absolute bottom-2 left-2 lg:bottom-2.5 lg:left-2.5"
            >
              {chip}
            </CountChip>
          )}
        </DishMedia>
        <span className="flex grow flex-col gap-1.5 p-3 lg:gap-2 lg:p-4">
          {photo && (
            <span className="font-display text-[17px] leading-5 font-bold break-words lg:text-xl lg:leading-6">
              {dish.name}
            </span>
          )}
          {dish.top ? (
            <span className={cn("flex items-start gap-1.5 font-semibold lg:gap-2", line)}>
              <NumberOneChip className="-mt-px lg:mt-0 lg:size-[22px] lg:text-[13px]" />
              <span className="min-w-0 break-words">{dish.top.name}</span>
            </span>
          ) : (
            <span className={cn("flex items-center gap-1.5 font-semibold text-brand-dark", line)}>
              <LiveDot />
              Voting open
            </span>
          )}
          <span className={cn("mt-auto pt-0.5 font-bold", line)}>
            {dish.top ? "See the ranking →" : "Rate one you know →"}
          </span>
        </span>
      </Link>
    </li>
  );
}
