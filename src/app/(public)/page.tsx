// Home (docs/01): what this is in one line, the city picker, the dish search, then the featured
// dishes the city leads with (one or two large cards and the round's closing line), the other
// dishes with a list, the dishes still waiting for contenders, and why the ranks can be trusted.
// ISR: nothing here reads the session.
import type { Metadata } from "next";
import Link from "next/link";
import { CityDishGrid, CityPicker, TrustBox } from "@/components/ranking";
import { DishSearch } from "@/components/ranking/DishSearch";
import { ComingNext, FeaturedDishes } from "@/components/ranking/FeaturedDishes";
import { Main, SectionHeader } from "@/components/layout/Page";
import { BRAND } from "@/lib/brand";
import { defaultCitySlug, getCityOverview } from "@/server/services/city-page.service";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: {
    absolute: `${BRAND.name} – the best restaurants for each dish in Islamabad and Rawalpindi`,
  },
  description:
    "Pick a dish and see restaurants ranked by diners' ratings of that dish: chicken karahi, biryani, nihari, burgers and more.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const citySlug = await defaultCitySlug();
  const overview = citySlug ? await getCityOverview(citySlug) : null;
  const cityName = overview?.city.name ?? "Islamabad";
  const lead = overview?.featured.dishes[0]?.name.toLowerCase() ?? "chicken karahi";

  return (
    <Main className="gap-8">
      <section className="flex flex-col gap-4 pt-2 sm:pt-4">
        {overview && <CityPicker cities={overview.cities} current={overview.city.slug} />}
        <h1 className="text-[2rem] leading-[1.08] font-extrabold tracking-tight sm:text-5xl">
          Where&apos;s the best <em className="text-brand not-italic">{lead}</em> in {cityName}?
        </h1>
        <p className="max-w-prose text-base text-muted-foreground sm:text-lg">
          <strong className="font-semibold text-foreground">{BRAND.tagline}.</strong>{" "}
          {BRAND.taglineEnglish} No stars for the whole restaurant, no imported reviews.
        </p>
        {overview && <DishSearch citySlug={overview.city.slug} cityName={overview.city.name} />}
        <p className="text-sm text-muted-foreground">
          Ate something good?{" "}
          <Link href="/rate" className="font-medium text-brand underline-offset-4 hover:underline">
            Rate a dish
          </Link>{" "}
          in four taps.
        </p>
      </section>

      {overview ? (
        <>
          {overview.featured.dishes.length > 0 && (
            <section aria-labelledby="featured" className="flex flex-col gap-3">
              <SectionHeader id="featured" title={`Open for voting in ${overview.city.name}`} />
              <FeaturedDishes
                citySlug={overview.city.slug}
                dishes={overview.featured.dishes}
                closingLine={overview.featured.closingLine}
              />
            </section>
          )}
          {overview.open.length > 0 && (
            <section aria-labelledby="dishes" className="flex flex-col gap-3">
              <SectionHeader
                id="dishes"
                title={
                  overview.featured.dishes.length > 0
                    ? "More dishes"
                    : `Popular dishes in ${overview.city.name}`
                }
              />
              <CityDishGrid citySlug={overview.city.slug} dishes={overview.open} />
            </section>
          )}
          {overview.comingNext.length > 0 && (
            <ComingNext citySlug={overview.city.slug} dishes={overview.comingNext} />
          )}
          <TrustBox minRaters={overview.minRaters} />
        </>
      ) : (
        <p className="text-muted-foreground">No city is set up yet.</p>
      )}
    </Main>
  );
}
