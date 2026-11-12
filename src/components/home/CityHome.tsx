// The home page "/" and the city page "/[city]" (spec §5 Home): one layout, the city page showing
// its own city. Phones: city switch, dish search, the featured vote, "Har dish ka pehla number"
// with the dish cards, "Coming next", and the trust block. Desktop (1024 px up): the city switch
// and the search live in the top bar, the featured vote becomes a two-column hero, and the cards
// sit under "Dishes in <city>". The home shows the first cards and links to the city page's
// #dishes for all of them (there is no all-dishes page). Server component: ISR, no session.
import Link from "next/link";
import { CityDishGrid, CityPicker, TrustBox } from "@/components/ranking";
import { DishSearch } from "@/components/ranking/DishSearch";
import { ComingNext, FeaturedVote } from "@/components/ranking/FeaturedDishes";
import { Main } from "@/components/layout/Page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { BRAND } from "@/lib/brand";
import type { CityDish, CityOverview } from "@/server/services/city-page.service";

/** The home shows this many dish cards on phones (spec §5) and this many from 1024 px up. */
const HOME_CARDS = { phone: 6, desktop: 8 } as const;

const listed = (d: CityDish) => d.ranked > 0 || d.contenders > 0;

export function CityHome({
  overview,
  variant,
  fallbackTitle,
}: {
  overview: CityOverview;
  variant: "home" | "city";
  /** The H1 when the city has no featured dish (the page's own headline from before). */
  fallbackTitle: React.ReactNode;
}) {
  const { city } = overview;
  const [lead, ...otherFeatured] = overview.featured.dishes;
  // The second featured dish leads the cards; one with nothing listed waits in "Coming next".
  const cards = [...otherFeatured.filter(listed), ...overview.open];
  const comingNext = [...otherFeatured.filter((d) => !listed(d)), ...overview.comingNext];
  const home = variant === "home";
  const allDishes = overview.dishes.length;
  // "See all N dishes" goes to the city page's #dishes, where every card shows.
  const seeAllPhone = home && cards.length > HOME_CARDS.phone;
  const seeAllDesktop = home && cards.length > HOME_CARDS.desktop;
  const seeAllHref = `/${city.slug}#dishes`;

  return (
    <Main width="full" className="gap-7 pt-1 sm:pt-4 lg:gap-14 lg:pt-12 lg:pb-14">
      <div className="flex flex-col gap-3 lg:gap-0">
        <CityPicker cities={overview.cities} current={city.slug} className="lg:hidden" />
        <div className="lg:hidden">
          <DishSearch anchor citySlug={city.slug} cityName={city.name} />
        </div>
        {lead ? (
          <div className="mt-1 lg:mt-0">
            <FeaturedVote
              citySlug={city.slug}
              cityName={city.name}
              dish={lead}
              closingLine={overview.featured.closingLine}
            />
          </div>
        ) : (
          <header className="mt-1 flex flex-col gap-2 lg:mt-0 lg:max-w-3xl lg:gap-4">
            <h1 className="font-display text-[28px] leading-[30px] font-extrabold tracking-[-0.015em] text-balance break-words lg:text-[60px] lg:leading-[62px] lg:tracking-[-0.025em]">
              {fallbackTitle}
            </h1>
            <p className="text-base leading-[23px] text-muted-foreground lg:leading-6">
              <strong className="font-bold text-ink">{BRAND.tagline}.</strong>{" "}
              {BRAND.taglineEnglish}
            </p>
          </header>
        )}
      </div>

      {cards.length > 0 && (
        <section aria-labelledby="dishes-title" id="dishes" className="flex scroll-mt-4 flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2
              id="dishes-title"
              className="font-display text-2xl leading-7 font-extrabold tracking-[-0.01em] lg:text-[32px] lg:leading-9 lg:tracking-[-0.015em]"
            >
              <span className="lg:hidden">{BRAND.tagline}</span>
              <span className="hidden lg:inline">Dishes in {city.name}</span>
            </h2>
            {seeAllDesktop && (
              <Link
                href={seeAllHref}
                className="hidden min-h-11 items-center text-[15px] font-bold text-brand-dark hover:text-brand-press lg:inline-flex"
              >
                See all {allDishes} dishes&nbsp;→
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground lg:hidden">
            {BRAND.taglineEnglish}
          </p>
          {!home && overview.mode === "bootstrap" && (
            <Badge dot className="mt-3">
              New lists · {overview.minRaters} votes rank a place
            </Badge>
          )}
          <div className="mt-3.5 lg:mt-6">
            <CityDishGrid
              citySlug={city.slug}
              dishes={cards}
              phoneLimit={home ? HOME_CARDS.phone : undefined}
              desktopLimit={home ? HOME_CARDS.desktop : undefined}
            />
          </div>
          {seeAllPhone && (
            <ButtonLink href={seeAllHref} variant="outline" className="mt-4 w-full lg:hidden">
              See all {allDishes} dishes
            </ButtonLink>
          )}
        </section>
      )}

      {comingNext.length > 0 && <ComingNext citySlug={city.slug} dishes={comingNext} />}

      <TrustBox minRaters={overview.minRaters} />
    </Main>
  );
}
