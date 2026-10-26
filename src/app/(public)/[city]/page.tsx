// /[city] (docs/01): the city's launch dishes with how many restaurants rank, the top one each,
// and a dish search. ISR.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CityDishGrid, CityPicker } from "@/components/ranking";
import { DishSearch } from "@/components/ranking/DishSearch";
import { SLUG_PATTERN } from "@/lib/slug";
import { getCityOverview } from "@/server/services/city-page.service";
import { yearInPakistan } from "@/server/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

const load = cache((citySlug: string) =>
  SLUG_PATTERN.test(citySlug) ? getCityOverview(citySlug) : Promise.resolve(null),
);

export async function generateMetadata({ params }: PageProps<"/[city]">): Promise<Metadata> {
  const overview = await load((await params).city);
  if (!overview) return { title: "Not found – DishRank", robots: { index: false } };
  const name = overview.city.name;
  return {
    title: `Best food in ${name} by dish (${yearInPakistan()}) – DishRank`,
    description: `Restaurants in ${name} ranked for each dish by diners' ratings: chicken karahi, biryani, nihari, burgers and more.`,
    alternates: { canonical: `/${overview.city.slug}` },
  };
}

export default async function CityPage({ params }: PageProps<"/[city]">) {
  const overview = await load((await params).city);
  if (!overview) notFound();
  const { city } = overview;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        {overview.mode === "bootstrap" && (
          <span className="w-fit rounded-full border px-2.5 py-0.5 text-sm font-medium">
            Early rankings
          </span>
        )}
        <h1 className="text-2xl font-bold">Best food in {city.name}, dish by dish</h1>
        <p className="text-base">Pick a dish to see the restaurants ranked for it.</p>
      </header>
      <CityPicker cities={overview.cities} current={city.slug} />
      <DishSearch citySlug={city.slug} cityName={city.name} />
      <section aria-labelledby="dishes" className="flex flex-col gap-2">
        <h2 id="dishes" className="text-lg font-semibold">
          Popular dishes
        </h2>
        <CityDishGrid overview={overview} />
      </section>
      <Link
        href={`/rate?city=${city.slug}`}
        className="inline-flex h-11 w-fit items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground"
      >
        Rate a dish
      </Link>
    </main>
  );
}
