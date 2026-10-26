// Restaurant page (docs/01 D3): its dishes ranked best first, each with score, votes and a "Rate"
// link; a plain Google Maps link from our own coordinates (a link only: no embedded map, no Maps
// API); "Report a problem". Merged restaurants redirect permanently (308); closed and hidden ones
// answer 404. ISR.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/components/layout/JsonLd";
import { ReportProblem } from "@/components/restaurant/ReportProblem";
import { formatPrice, formatScore, formatVotes } from "@/lib/format";
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
  if (result.kind !== "found") return { title: "DishRank", robots: { index: false } };
  const { restaurant, dishes } = result;
  const place = [restaurant.area?.name, restaurant.city.name].filter(Boolean).join(", ");
  const best = dishes.find((d) => d.rankInCity !== null);
  const votes = dishes.reduce((sum, d) => sum + d.votes, 0);
  const title = `${restaurant.name}, ${place} – DishRank`;
  const description = best
    ? `${restaurant.name} in ${place}: ${best.dish.name} is #${best.rankInCity} in ${restaurant.city.name} (${formatScore(best.score ?? 0)} · ${formatVotes(best.votes)}). Dish-by-dish scores from diners.`
    : `${restaurant.name} in ${place}: dish-by-dish scores from diners' ratings.`;
  const path = `/${restaurant.city.slug}/r/${restaurant.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", siteName: "DishRank" },
    // Until someone rates a dish here the page has nothing of its own: kept out of search results.
    ...(votes === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function RestaurantPage({ params }: PageProps<"/[city]/r/[slug]">) {
  const { city, slug } = await params;
  const result = await load(slug);
  if (result.kind === "not_found") notFound();
  if (result.kind === "redirect") permanentRedirect(`/${result.citySlug}/r/${result.slug}`);
  const { restaurant, dishes, claimed } = result;
  if (restaurant.city.slug !== city) {
    permanentRedirect(`/${restaurant.city.slug}/r/${restaurant.slug}`);
  }
  const path = `/${restaurant.city.slug}/r/${restaurant.slug}`;
  const located = restaurant.lat !== null && restaurant.lng !== null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href={`/${restaurant.city.slug}`}
          className="inline-flex min-h-11 items-center underline"
        >
          {restaurant.city.name}
        </Link>
      </nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[restaurant.area?.name, restaurant.city.name].filter(Boolean).join(", ")}
          {claimed ? " · Claimed by the owner" : ""}
        </p>
        {restaurant.address && <p className="text-sm">{restaurant.address}</p>}
        <div className="flex flex-wrap gap-x-4">
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="inline-flex min-h-11 items-center underline"
            >
              {restaurant.phone}
            </a>
          )}
          {located && (
            <a
              href={mapsLink(restaurant.lat!, restaurant.lng!)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center underline"
            >
              Open in Google Maps
            </a>
          )}
        </div>
      </header>

      <section aria-labelledby="dishes" className="flex flex-col gap-2">
        <h2 id="dishes" className="text-lg font-semibold">
          Dishes
        </h2>
        {dishes.length === 0 ? (
          <p className="text-sm">No dishes listed yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {dishes.map((d) => (
              <li key={d.restaurantDishId} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/${restaurant.city.slug}/best-${d.dish.slug}`}
                    className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline"
                  >
                    {d.dish.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {d.rankInCity !== null
                      ? `#${d.rankInCity} in ${restaurant.city.name}`
                      : d.votes > 0
                        ? "Not enough votes yet"
                        : "No votes yet"}
                    {d.price !== null ? ` · ${formatPrice(d.price)}` : ""}
                    {d.variantTags.length > 0 ? ` · ${d.variantTags.join(", ")}` : ""}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {d.rankInCity !== null && d.score !== null ? (
                    <span className="rounded-md bg-foreground px-2 py-0.5 text-base font-semibold text-background tabular-nums">
                      {formatScore(d.score)}
                    </span>
                  ) : null}
                  {d.votes > 0 && (
                    <span className="text-xs text-muted-foreground">{formatVotes(d.votes)}</span>
                  )}
                  <Link
                    href={`/rate?city=${restaurant.city.slug}&r=${restaurant.slug}&d=${d.dish.slug}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium underline"
                  >
                    Rate
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/rate?city=${restaurant.city.slug}&r=${restaurant.slug}`}
          className="inline-flex min-h-11 w-fit items-center text-sm underline"
        >
          Rate another dish here
        </Link>
      </section>

      <ReportProblem
        restaurantId={restaurant.id}
        dishes={dishes.map((d) => ({ id: d.dish.id, name: d.dish.name }))}
        returnPath={path}
      />

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
    </main>
  );
}
