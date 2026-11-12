// /[city] (docs/01, spec §5 Home): the same layout as the home page, for this city, with every
// dish card. ISR.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CityHome } from "@/components/home/CityHome";
import { cityDescription } from "@/lib/descriptions";
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
    description: cityDescription(name),
    alternates: { canonical: `/${overview.city.slug}` },
  };
}

export default async function CityPage({ params }: PageProps<"/[city]">) {
  const overview = await load((await params).city);
  if (!overview) notFound();

  return (
    <CityHome
      overview={overview}
      variant="city"
      fallbackTitle={
        <>
          Best food in {overview.city.name}, <span className="text-brand">dish by dish</span>
        </>
      }
    />
  );
}
