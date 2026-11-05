// Home (docs/01): what this is in one line, the city picker, dish search and the first city's dish
// grid, then why the ranks can be trusted. ISR: nothing here reads the session.
import type { Metadata } from "next";
import Link from "next/link";
import { CityDishGrid, CityPicker, TrustBox } from "@/components/ranking";
import { DishSearch } from "@/components/ranking/DishSearch";
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

  return (
    <Main className="gap-8">
      <section className="flex flex-col gap-4 pt-2 sm:pt-4">
        {overview && <CityPicker cities={overview.cities} current={overview.city.slug} />}
        <h1 className="text-[2rem] leading-[1.08] font-extrabold tracking-tight sm:text-5xl">
          Where&apos;s the best <em className="text-brand not-italic">chicken karahi</em> in{" "}
          {cityName}?
        </h1>
        <p className="max-w-prose text-base text-muted-foreground sm:text-lg">
          Restaurants ranked dish by dish, from ratings by people who ate there. No stars for the
          whole restaurant, no imported reviews.
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
          <section aria-labelledby="dishes" className="flex flex-col gap-3">
            <SectionHeader id="dishes" title={`Popular dishes in ${overview.city.name}`} />
            <CityDishGrid overview={overview} />
          </section>
          <TrustBox minRaters={overview.minRaters} />
        </>
      ) : (
        <p className="text-muted-foreground">No city is set up yet.</p>
      )}
    </Main>
  );
}
