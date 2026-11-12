// Restaurant page (docs/01 D3; spec §5 "Restaurant page"): "What to order at X". A blush header
// with Back and Share, then its ranked dishes best rank first (each a card link to that dish's
// ranking, with the city-wide rank "of N"), the dishes not ranked here yet with a Rate pill, and
// "Find it": the address, a phone number only on a checked or claimed listing, and a plain Google
// Maps link from our own coordinates (a link only: no embedded map, no Maps API). Then menu upload,
// "Report a problem" and the owner claim. Merged restaurants redirect permanently (308); closed and
// hidden ones answer 404. ISR.
import type { Metadata } from "next";
import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PhoneIcon,
} from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { DishIcon } from "@/components/brand/DishIcon";
import { JsonLd } from "@/components/layout/JsonLd";
import { Main } from "@/components/layout/Page";
import { ShareButton } from "@/components/ranking/ShareButton";
import { ClaimRestaurant } from "@/components/restaurant/ClaimRestaurant";
import { MenuUploadButton } from "@/components/restaurant/MenuUploadButton";
import { ReportProblem } from "@/components/restaurant/ReportProblem";
import { RankedDishRows, UnrankedDishRows } from "@/components/restaurant/RestaurantDishRows";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { AddRow, InlineLink, SmallPrint } from "@/components/ui/kit";
import { BRAND } from "@/lib/brand";
import { restaurantDescription } from "@/lib/descriptions";
import { restaurantPageIndexable } from "@/lib/indexing";
import { formatAddress, formatScore, formatVotes } from "@/lib/format";
import { restaurantJsonLd } from "@/server/seo";
import {
  getPublicRestaurant,
  getRestaurantPageContext,
} from "@/server/services/restaurant.service";

export const revalidate = 3600;

/** No paths at build time: every restaurant page renders on its first visit, then ISR. */
export async function generateStaticParams() {
  return [];
}

const load = cache(getPublicRestaurant);

/** A link to the place on Google Maps, built from our own coordinates (no Google data stored). */
const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export async function generateMetadata({
  params,
}: PageProps<"/[city]/r/[slug]">): Promise<Metadata> {
  const result = await load((await params).slug);
  if (result.kind !== "found") return { title: "Not found", robots: { index: false } };
  const { restaurant, dishes } = result;
  const place = [restaurant.area?.name, restaurant.city.name].filter(Boolean).join(", ");
  const best = dishes.find((d) => d.rankInCity !== null);
  const rankedDishes = dishes.filter((d) => d.rankInCity !== null).length;
  const title = `${restaurant.name}, ${place}`;
  const description = restaurantDescription({
    name: restaurant.name,
    place,
    city: restaurant.city.name,
    best: best
      ? {
          dish: best.dish.name,
          rank: best.rankInCity!,
          score: formatScore(best.score ?? 0),
          votes: formatVotes(best.votes),
        }
      : null,
  });
  const path = `/${restaurant.city.slug}/r/${restaurant.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} · ${BRAND.name}`,
      description,
      url: path,
      type: "website",
      siteName: BRAND.name,
    },
    // Until a dish ranks here the page has nothing of its own: kept out of search results.
    ...(restaurantPageIndexable(rankedDishes) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function RestaurantPage({ params }: PageProps<"/[city]/r/[slug]">) {
  const { city, slug } = await params;
  const result = await load(slug);
  if (result.kind === "not_found") notFound();
  if (result.kind === "redirect") permanentRedirect(`/${result.citySlug}/r/${result.slug}`);
  const { restaurant, dishes, claimed, unchecked } = result;
  if (restaurant.city.slug !== city) {
    permanentRedirect(`/${restaurant.city.slug}/r/${restaurant.slug}`);
  }
  const path = `/${restaurant.city.slug}/r/${restaurant.slug}`;
  const located = restaurant.lat !== null && restaurant.lng !== null;
  const rateHere = `/rate?city=${restaurant.city.slug}&r=${restaurant.slug}`;
  const place = [restaurant.area?.name, restaurant.city.name].filter(Boolean).join(", ");
  const dishHref = (dishSlug: string) => `/${restaurant.city.slug}/best-${dishSlug}`;
  const rateHref = (dishSlug: string) => `${rateHere}&d=${dishSlug}`;

  // Best rank first (the service orders ranked rows by score; ranks are city-wide, so the two can
  // differ), then the rest as the service orders them: most raters first.
  const ranked = dishes
    .filter((d) => d.rankInCity !== null)
    .sort((a, b) => a.rankInCity! - b.rankInCity! || (b.score ?? 0) - (a.score ?? 0));
  const waiting = dishes.filter((d) => d.rankInCity === null);
  const context = await getRestaurantPageContext(restaurant.city.slug, dishes);
  const rankedInCity: Record<string, number> = {};
  for (const d of ranked) {
    const n = context.rankedInCity[d.dish.id];
    if (n !== undefined) rankedInCity[d.dish.slug] = n;
  }
  const row = (d: (typeof dishes)[number]) => ({
    id: d.restaurantDishId,
    dish: d.dish,
    votes: d.votes,
    score: d.score,
    rankInCity: d.rankInCity,
    price: d.price,
    variantTags: d.variantTags,
  });

  return (
    <Main className="gap-0 px-0 pt-0 pb-8 sm:px-0 sm:pt-0">
      <header className="flex flex-col rounded-b-sheet bg-blush px-4 pt-3 pb-5 sm:mx-6 sm:mt-6 sm:rounded-sheet sm:px-6 sm:pb-6">
        <div className="flex items-center justify-between">
          <ButtonLink
            href={`/${restaurant.city.slug}`}
            variant="round"
            size="icon"
            aria-label={`Back to ${restaurant.city.name}`}
          >
            <ArrowLeftIcon aria-hidden="true" className="size-[22px]" />
          </ButtonLink>
          <ShareButton
            appearance="round"
            className="shadow-none"
            label="Share this place"
            city={restaurant.city.slug}
            // share_click counts a city and a dish; a restaurant has no dish, so this click is not
            // counted (the empty slug is refused). Asked of ShareButton's owner: a restaurant event.
            fallback="whatsapp"
            title={`What to order at ${restaurant.name}`}
            text={
              ranked.length > 0
                ? `What to order at ${restaurant.name}, ${place}: dishes ranked by diners on ${BRAND.name}.`
                : `${restaurant.name}, ${place}, on ${BRAND.name}. Rate the dishes you've had there.`
            }
            path={path}
          />
        </div>
        <p className="mt-3.5 flex items-center gap-1.5 text-[13px] leading-[18px] font-semibold text-muted-foreground">
          <MapPinIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {place}
        </p>
        <h1 className="mt-1.5 font-display text-[28px] leading-[30px] font-extrabold tracking-[-0.015em] text-balance break-anywhere sm:text-[34px] sm:leading-[38px]">
          What to order at <span className="text-brand">{restaurant.name}</span>
        </h1>
        <p className="mt-2 text-[15px] leading-5">
          {ranked.length > 0
            ? `${ranked.length} ${ranked.length === 1 ? "dish" : "dishes"} ranked here by diners.`
            : "No dish ranks here yet. Rate one you've had."}
        </p>
        {claimed && (
          <Badge className="mt-3 bg-card">
            <BadgeCheckIcon aria-hidden="true" /> Owner on {BRAND.name}
          </Badge>
        )}
        {unchecked && (
          <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">
            Listed from <InlineLink href="/about/data">open map data</InlineLink>; our team has not
            checked it yet. If something is wrong, report it below.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-7 px-4 pt-6 sm:px-6">
        {ranked.length > 0 && (
          <section aria-labelledby="ranked-dishes" className="flex flex-col">
            <h2
              id="ranked-dishes"
              className="font-display text-2xl leading-7 font-extrabold tracking-[-0.01em]"
            >
              Ranked dishes
            </h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
              Rank is this place&apos;s position for that dish across {restaurant.city.name}.
            </p>
            <div className="mt-3">
              <RankedDishRows
                rows={ranked.map(row)}
                dishHref={dishHref}
                rankedInCity={rankedInCity}
              />
            </div>
          </section>
        )}

        {waiting.length > 0 && (
          <section aria-labelledby="not-ranked" className="flex flex-col">
            <h2 id="not-ranked" className="font-display text-xl leading-6 font-extrabold">
              Not ranked here yet
            </h2>
            <div className="mt-3">
              <UnrankedDishRows
                rows={waiting.map(row)}
                dishHref={dishHref}
                rateHref={rateHref}
                minRaters={context.minRaters}
              />
            </div>
          </section>
        )}

        {dishes.length === 0 ? (
          <EmptyState
            icon={<DishIcon name="plate" size={26} />}
            title="No dishes listed yet"
            text={`Rate what you ate here and it appears on this page and in its ranking.`}
            action={{ href: rateHere, label: "Rate a dish here" }}
          />
        ) : (
          <AddRow href={rateHere} className="-mt-3">
            Rate another dish here
          </AddRow>
        )}

        {(restaurant.address || restaurant.phone || located) && (
          <section aria-labelledby="find-it" className="flex flex-col">
            <h2 id="find-it" className="font-display text-xl leading-6 font-extrabold">
              Find it
            </h2>
            <div className="mt-3 flex flex-col gap-3.5 rounded-card border bg-card p-4">
              <p className="flex items-start gap-2.5 text-[15px] leading-[22px]">
                <MapPinIcon aria-hidden="true" className="mt-px size-5 shrink-0" />
                <span className="min-w-0 break-anywhere">
                  {restaurant.address ? formatAddress(restaurant.address) : place}
                </span>
              </p>
              {restaurant.phone && (
                <ButtonLink
                  variant="outline"
                  size="lg"
                  className="w-full text-[15px]"
                  href={`tel:${restaurant.phone}`}
                >
                  <PhoneIcon aria-hidden="true" className="size-4" /> {restaurant.phone}
                </ButtonLink>
              )}
              {located && (
                <ButtonLink
                  variant="outline"
                  size="lg"
                  className="w-full text-[15px]"
                  href={mapsLink(restaurant.lat!, restaurant.lng!)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps
                  <ExternalLinkIcon aria-hidden="true" className="size-4" />
                  <span className="sr-only">(opens in a new tab)</span>
                </ButtonLink>
              )}
            </div>
          </section>
        )}

        <MenuUploadButton restaurantId={restaurant.id} />

        <div className="flex flex-col gap-3">
          <ReportProblem
            restaurantId={restaurant.id}
            dishes={dishes.map((d) => ({ id: d.dish.id, name: d.dish.name }))}
            returnPath={path}
          />
          {!claimed && <ClaimRestaurant restaurantId={restaurant.id} returnPath={path} />}
        </div>

        <SmallPrint className="-mt-2">
          Scores are diners&apos; opinions, not facts about a restaurant. Is this your place?{" "}
          <InlineLink href="/dispute">Dispute a listing</InlineLink>.
        </SmallPrint>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          ...restaurantJsonLd({
            slug: restaurant.slug,
            name: restaurant.name,
            citySlug: restaurant.city.slug,
            cityName: restaurant.city.name,
            areaName: restaurant.area?.name ?? null,
            address: restaurant.address && formatAddress(restaurant.address),
            phone: restaurant.phone,
            lat: restaurant.lat,
            lng: restaurant.lng,
          }),
        }}
      />
    </Main>
  );
}
