// /[city] (docs/01): the city's launch dishes with how many restaurants rank, the top one each,
// and a dish search. ISR.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Main, PageHeader, SectionHeader } from "@/components/layout/Page";
import { CityDishGrid, CityPicker, TrustBox } from "@/components/ranking";
import { DishSearch } from "@/components/ranking/DishSearch";
import { Badge } from "@/components/ui/badge";
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
  if (!overview) return { title: "Not found", robots: { index: false } };
  const name = overview.city.name;
  return {
    title: `Best food in ${name} by dish (${yearInPakistan()})`,
    description: `Restaurants in ${name} ranked for each dish by diners' ratings: chicken karahi, biryani, nihari, burgers and more.`,
    alternates: { canonical: `/${overview.city.slug}` },
  };
}

export default async function CityPage({ params }: PageProps<"/[city]">) {
  const overview = await load((await params).city);
  if (!overview) notFound();
  const { city } = overview;

  return (
    <Main className="min-h-dvh gap-8">
      <div className="flex flex-col gap-4 pt-2 sm:pt-4">
        <CityPicker cities={overview.cities} current={city.slug} />
        <PageHeader
          eyebrow={
            overview.mode === "bootstrap" ? (
              <Badge>New lists · {overview.minRaters} votes rank a place</Badge>
            ) : undefined
          }
          title={
            <>
              Best food in {city.name}, <span className="text-brand">dish by dish</span>
            </>
          }
          lede="Pick a dish to see the restaurants ranked for it."
        />
        <DishSearch citySlug={city.slug} cityName={city.name} />
      </div>
      <section aria-labelledby="dishes" className="flex flex-col gap-3">
        <SectionHeader id="dishes" title="Popular dishes" />
        <CityDishGrid overview={overview} />
      </section>
      <TrustBox minRaters={overview.minRaters} />
    </Main>
  );
}
