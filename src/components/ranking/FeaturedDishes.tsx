// The featured vote (spec §4 "Featured vote card", §5 Home): the dish a city's home leads with, and
// the line that says when voting for the round's results closes (the ranking itself never closes).
// One DOM for both layouts. Phones: a blush card, the photo (or the no-photo tile carrying the
// sticker and the white H1) on top, then the Roman-Urdu line, the Primary button and the closing
// line. Desktop (1024 px up): two columns, the text left (sticker, H1, line, button, closing line,
// tagline) and the 400 px photo or tile right. Also "Coming next": the dishes with no contenders
// yet, asking for nominations. Server components.
import { ArrowRightIcon, Clock3Icon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { DishGlyph } from "@/components/dish/DishGlyph";
import { DishMedia, hasDishPhoto } from "@/components/dish/DishMedia";
import { placesLabel, romanUrduLine, voteLabel } from "@/components/home/featured-copy";
import { ButtonLink } from "@/components/ui/button-link";
import { CountChip, NumberOneChip, Sticker } from "@/components/ui/kit";
import { BRAND } from "@/lib/brand";
import { dishLook } from "@/lib/dish-look";
import { suggestPlacePath } from "@/lib/paths";
import type { CityDish } from "@/server/services/city-page.service";

export function FeaturedVote({
  citySlug,
  cityName,
  dish,
  closingLine,
}: {
  citySlug: string;
  cityName: string;
  dish: CityDish;
  closingLine: string | null;
}) {
  const photo = hasDishPhoto(dish.slug);
  const urdu = romanUrduLine(dish.slug);
  // contenders counts every place on the list, the ranked ones included.
  const listed = dish.contenders > 0 || dish.ranked > 0;
  const places = Math.max(dish.contenders, dish.ranked);
  const inTheRunning = listed ? `${placesLabel(places)} in the running` : null;

  return (
    <section
      aria-labelledby="featured-title"
      className={cn(
        "relative grid overflow-hidden rounded-block bg-blush",
        photo
          ? "[grid-template-areas:'media'_'head'_'body']"
          : "[grid-template-areas:'media'_'body']",
        "lg:grid-cols-2 lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-12 lg:overflow-visible lg:rounded-none lg:bg-transparent",
        "lg:[grid-template-areas:'._media'_'head_media'_'body_media'_'._media']",
      )}
    >
      {photo ? (
        // One element for both layouts, so the page keeps exactly one priority image.
        <DishMedia
          slug={dish.slug}
          slot="featured"
          priority
          className="h-46 [grid-area:media] lg:h-[400px] lg:rounded-sheet"
        >
          {inTheRunning && (
            <CountChip className="absolute bottom-5 left-5 hidden px-3 py-1.5 text-sm leading-[18px] lg:inline-block">
              {inTheRunning}
            </CountChip>
          )}
        </DishMedia>
      ) : (
        <>
          <DishMedia
            slug={dish.slug}
            slot="featured"
            className="min-h-[196px] [grid-area:media] lg:hidden"
          />
          <DishMedia
            slug={dish.slug}
            slot="hero"
            className="hidden h-[400px] rounded-sheet [grid-area:media] lg:block"
          >
            {inTheRunning && (
              <CountChip
                onTile
                className="absolute bottom-5 left-5 px-3 py-1.5 text-sm leading-[18px]"
              >
                {inTheRunning}
              </CountChip>
            )}
          </DishMedia>
        </>
      )}

      <div
        className={cn(
          "flex flex-col lg:[grid-area:head] lg:p-0",
          photo
            ? "px-4 pt-4 [grid-area:head]"
            : "relative z-[1] justify-end p-4 pt-[68px] [grid-area:media]",
        )}
      >
        {listed && (
          <>
            <Sticker onTile={!photo} className="absolute top-3.5 left-3.5 z-[1] lg:hidden" />
            <Sticker className="hidden -rotate-3 px-3 text-sm leading-[18px] lg:inline-block" />
          </>
        )}
        <h1
          id="featured-title"
          className={cn(
            "font-display text-[28px] leading-[30px] font-extrabold tracking-[-0.015em] text-balance break-words",
            "lg:mt-4 lg:text-[60px] lg:leading-[62px] lg:tracking-[-0.025em]",
            photo ? "text-ink" : "text-white lg:text-ink",
          )}
        >
          Where&apos;s the best{" "}
          <span className={photo ? "text-brand" : "lg:text-brand"}>{dish.name.toLowerCase()}</span>{" "}
          in {cityName}?
        </h1>
      </div>

      <div className="flex flex-col p-4 [grid-area:body] lg:p-0 lg:pt-4">
        {urdu && (
          <p className="text-[15px] leading-5 font-semibold lg:text-xl lg:leading-7">{urdu}</p>
        )}
        {dish.top ? (
          <p
            className={cn(
              "flex items-start gap-1.5 text-sm leading-5 font-semibold lg:text-base lg:leading-6",
              urdu && "mt-2",
            )}
          >
            <NumberOneChip className="mt-px lg:mt-0.5" />
            <span className="min-w-0 break-words">
              {dish.top.name}
              <span className="font-normal text-muted-foreground"> · {dish.ranked} ranked</span>
            </span>
          </p>
        ) : (
          !listed && (
            <p className={cn("text-[15px] leading-5", urdu && "mt-2")}>
              We&apos;re picking the contenders.
            </p>
          )
        )}
        <div
          className={cn(
            "flex flex-col gap-2.5 lg:mt-6 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-3",
            (urdu || dish.top || !listed) && "mt-3.5",
          )}
        >
          {listed ? (
            <ButtonLink
              href={`/${citySlug}/best-${dish.slug}`}
              size="lg"
              className="h-auto min-h-13 w-full py-3 text-center whitespace-normal lg:min-h-14 lg:w-auto lg:px-7 lg:text-[17px] lg:shadow-cta"
            >
              {voteLabel(dish.name)}
              <ArrowRightIcon aria-hidden="true" strokeWidth={2.5} className="size-[18px]" />
            </ButtonLink>
          ) : (
            <ButtonLink
              href={suggestPlacePath(citySlug)}
              prefetch={false}
              size="lg"
              className="h-auto min-h-13 w-full py-3 text-center whitespace-normal lg:w-auto lg:px-7"
            >
              Tell us which places should be on the list
            </ButtonLink>
          )}
          {closingLine && (
            <p className="text-center text-[13px] leading-[18px] font-semibold text-balance lg:text-left lg:text-[15px] lg:leading-5">
              <Clock3Icon
                aria-hidden="true"
                className="mr-1.5 inline size-3.5 align-[-2px] lg:size-4 lg:align-[-3px]"
              />
              {closingLine}
            </p>
          )}
        </div>
        <p className="mt-6 hidden max-w-[520px] text-base leading-6 text-muted-foreground lg:block">
          <strong className="font-bold text-ink">{BRAND.tagline}.</strong> {BRAND.taglineEnglish}
        </p>
      </div>
    </section>
  );
}

/** The dishes with no contenders yet: a compact group that asks for nominations, not votes. */
export function ComingNext({ citySlug, dishes }: { citySlug: string; dishes: CityDish[] }) {
  return (
    <section aria-labelledby="coming-next" className="flex flex-col gap-2">
      <h2
        id="coming-next"
        className="font-display text-xl leading-6 font-extrabold lg:text-2xl lg:leading-7"
      >
        Coming next
      </h2>
      <p className="text-sm leading-5">
        <Link
          href={suggestPlacePath(citySlug)}
          prefetch={false}
          className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-2 hover:text-brand-press"
        >
          Tell us which places should be on the list
        </Link>
        .
      </p>
      <ul className="flex flex-wrap gap-2">
        {dishes.map((d) => {
          const look = dishLook(d.slug);
          return (
            <li key={d.slug}>
              <Link
                href={`/${citySlug}/best-${d.slug}`}
                prefetch={false}
                className="pressable inline-flex min-h-11 items-center gap-2 rounded-full border bg-card py-1 pr-3.5 pl-1.5 text-sm font-semibold text-ink hover:bg-sand"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: look.hex }}
                >
                  <DishGlyph look={look} size={20} stroke={3.4} />
                </span>
                {d.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
