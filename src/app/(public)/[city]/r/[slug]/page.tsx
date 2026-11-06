// Restaurant page (docs/01 D3): its dishes ranked best first, each with score, votes and a "Rate"
// link; a plain Google Maps link from our own coordinates (a link only: no embedded map, no Maps
// API); "Report a problem". Merged restaurants redirect permanently (308); closed and hidden ones
// answer 404. ISR.
import type { Metadata } from "next";
import { BadgeCheckIcon, ChevronRightIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { DishIcon } from "@/components/brand/DishIcon";
import { JsonLd } from "@/components/layout/JsonLd";
import { Main, SectionHeader } from "@/components/layout/Page";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { ClaimRestaurant } from "@/components/restaurant/ClaimRestaurant";
import { MenuUploadButton } from "@/components/restaurant/MenuUploadButton";
import { ReportProblem } from "@/components/restaurant/ReportProblem";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { BRAND } from "@/lib/brand";
import { formatFromPrice, formatScore, formatVotes } from "@/lib/format";
import { restaurantJsonLd } from "@/server/seo";
import { getPublicRestaurant } from "@/server/services/restaurant.service";

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
  const votes = dishes.reduce((sum, d) => sum + d.votes, 0);
  const title = `${restaurant.name}, ${place}`;
  const description = best
    ? `${restaurant.name} in ${place}: ${best.dish.name} is #${best.rankInCity} in ${restaurant.city.name} (${formatScore(best.score ?? 0)} · ${formatVotes(best.votes)}). Dish-by-dish scores from diners.`
    : `${restaurant.name} in ${place}: dish-by-dish scores from diners' ratings.`;
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
    // Until someone rates a dish here the page has nothing of its own: kept out of search results.
    ...(votes === 0 ? { robots: { index: false, follow: true } } : {}),
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

  return (
    <Main className="min-h-dvh gap-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        <Link
          href={`/${restaurant.city.slug}`}
          className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline"
        >
          {restaurant.city.name}
        </Link>
        {restaurant.area && (
          <>
            <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{restaurant.area.name}</span>
          </>
        )}
      </nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-extrabold break-anywhere sm:text-4xl">{restaurant.name}</h1>
          {claimed && (
            <Badge>
              <BadgeCheckIcon aria-hidden="true" /> Owner on {BRAND.name}
            </Badge>
          )}
        </div>
        <p className="text-base text-muted-foreground">
          {[restaurant.address, restaurant.area?.name, restaurant.city.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {(restaurant.phone || located) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {restaurant.phone && (
              <ButtonLink
                variant="outline"
                size="sm"
                className="h-11 text-base"
                href={`tel:${restaurant.phone}`}
              >
                <PhoneIcon aria-hidden="true" /> {restaurant.phone}
              </ButtonLink>
            )}
            {located && (
              <ButtonLink
                variant="outline"
                size="sm"
                className="h-11 text-base"
                href={mapsLink(restaurant.lat!, restaurant.lng!)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPinIcon aria-hidden="true" /> Open in Google Maps
              </ButtonLink>
            )}
          </div>
        )}
        {unchecked && (
          <p className="text-sm text-muted-foreground">
            Listed from{" "}
            <Link href="/about/data" className="underline underline-offset-2">
              open map data
            </Link>
            ; our team has not checked it yet. If something is wrong, report it below.
          </p>
        )}
      </header>

      <section aria-labelledby="dishes" className="flex flex-col gap-3">
        <SectionHeader
          id="dishes"
          title="Dishes here"
          aside={
            dishes.length > 0 ? (
              <Link
                href={rateHere}
                className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                Rate another dish here
              </Link>
            ) : undefined
          }
        />
        {dishes.length === 0 ? (
          <EmptyState
            icon={<DishIcon name="plate" size={26} />}
            title="No dishes listed yet"
            text={`Rate what you ate here and it appears on this page and in its ranking.`}
            action={{ href: rateHere, label: "Rate a dish here" }}
          />
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-card">
            {dishes.map((d) => (
              <li key={d.restaurantDishId} className="flex items-start gap-3 px-3 py-3 sm:px-4">
                <span className="mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <DishIcon slug={d.dish.slug} size={22} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    href={`/${restaurant.city.slug}/best-${d.dish.slug}`}
                    className="inline-flex min-h-11 items-center font-display text-lg leading-tight font-bold break-anywhere underline-offset-4 hover:underline"
                  >
                    {d.dish.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {d.rankInCity !== null
                      ? `#${d.rankInCity} in ${restaurant.city.name}`
                      : d.votes > 0
                        ? "Not enough votes yet"
                        : "No votes yet"}
                    {d.price !== null ? ` · ${formatFromPrice(d.price)}` : ""}
                  </span>
                  {d.variantTags.length > 0 && (
                    <span className="flex flex-wrap gap-1.5 pt-1">
                      {d.variantTags.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {d.rankInCity !== null && d.score !== null ? (
                    <ScoreBadge score={d.score} votes={d.votes} size="lg" layout="stack" />
                  ) : d.votes > 0 ? (
                    <span className="text-xs text-muted-foreground">{formatVotes(d.votes)}</span>
                  ) : null}
                  <Link
                    href={`${rateHere}&d=${d.dish.slug}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Rate
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MenuUploadButton restaurantId={restaurant.id} />

      <div className="flex flex-col gap-3">
        <ReportProblem
          restaurantId={restaurant.id}
          dishes={dishes.map((d) => ({ id: d.dish.id, name: d.dish.name }))}
          returnPath={path}
        />
        {!claimed && <ClaimRestaurant restaurantId={restaurant.id} returnPath={path} />}
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
            address: restaurant.address,
            phone: restaurant.phone,
            lat: restaurant.lat,
            lng: restaurant.lng,
          }),
        }}
      />
    </Main>
  );
}
