// Restaurant page. Phase 2 ships the minimal page so merged restaurants redirect permanently
// (permanentRedirect = HTTP 308, docs/06); Phase 4 adds scores, rate buttons and SEO metadata.
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { getPublicRestaurant } from "@/server/services/restaurant.service";

export const revalidate = 3600;

/** No paths at build time: every restaurant page renders on its first visit, then ISR. */
export async function generateStaticParams() {
  return [];
}

const load = cache(getPublicRestaurant);

export async function generateMetadata({
  params,
}: PageProps<"/[city]/r/[slug]">): Promise<Metadata> {
  const result = await load((await params).slug);
  return {
    title: result.kind === "found" ? `${result.restaurant.name} · DishRank` : "DishRank",
    // DECISION-PENDING: kept out of search engines until Phase 4 completes the page.
    robots: { index: false, follow: true },
  };
}

export default async function RestaurantPage({ params }: PageProps<"/[city]/r/[slug]">) {
  const { city, slug } = await params;
  const result = await load(slug);
  if (result.kind === "not_found") notFound();
  if (result.kind === "redirect") permanentRedirect(`/${result.citySlug}/r/${result.slug}`);
  const { restaurant, dishes } = result;
  if (restaurant.city.slug !== city) {
    permanentRedirect(`/${restaurant.city.slug}/r/${restaurant.slug}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[restaurant.area?.name, restaurant.city.name].filter(Boolean).join(", ")}
        </p>
        {restaurant.address && <p className="text-sm">{restaurant.address}</p>}
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
              <li key={d.restaurantDishId} className="flex justify-between gap-2 p-3 text-sm">
                <span>{d.dish.name}</span>
                <span className="text-muted-foreground">
                  {d.rankInCity !== null
                    ? `#${d.rankInCity} in ${restaurant.city.name}`
                    : "Not enough votes yet"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
