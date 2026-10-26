// Home (docs/01): city picker, the first city's launch-dish grid, dish search and "Rate a dish".
// ISR: nothing here reads the session.
import type { Metadata } from "next";
import Link from "next/link";
import { CityDishGrid, CityPicker } from "@/components/ranking";
import { DishSearch } from "@/components/ranking/DishSearch";
import { defaultCitySlug, getCityOverview } from "@/server/services/city-page.service";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "DishRank – the best restaurants for each dish in Islamabad and Rawalpindi",
  description:
    "Pick a dish and see restaurants ranked by diners' ratings of that dish: chicken karahi, biryani, nihari, burgers and more.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const citySlug = await defaultCitySlug();
  const overview = citySlug ? await getCityOverview(citySlug) : null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">DishRank</h1>
        <p className="text-base">
          The best restaurants for each dish, ranked by people who ate it.
        </p>
      </header>
      <Link
        href="/rate"
        className="inline-flex h-11 w-fit items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground"
      >
        Rate a dish
      </Link>
      {overview && (
        <>
          <CityPicker cities={overview.cities} current={overview.city.slug} />
          <DishSearch citySlug={overview.city.slug} cityName={overview.city.name} />
          <section aria-labelledby="dishes" className="flex flex-col gap-2">
            <h2 id="dishes" className="text-lg font-semibold">
              Popular dishes in {overview.city.name}
            </h2>
            <CityDishGrid overview={overview} />
          </section>
        </>
      )}
      <Link href="/me" className="inline-flex min-h-11 w-fit items-center underline">
        My ratings
      </Link>
    </main>
  );
}
