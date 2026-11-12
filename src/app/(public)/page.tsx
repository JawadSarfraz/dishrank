// Home (docs/01, spec §5 Home): the default city's page. The city switch, the dish search, the
// featured vote and the round's closing line, the dish cards (the first few, then "See all N
// dishes" on the city page), the dishes still waiting for contenders, and why the ranks can be
// trusted. ISR: nothing here reads the session.
import type { Metadata } from "next";
import { HOME_DESCRIPTION } from "@/lib/descriptions";
import { CityHome } from "@/components/home/CityHome";
import { Main } from "@/components/layout/Page";
import { BRAND } from "@/lib/brand";
import { defaultCitySlug, getCityOverview } from "@/server/services/city-page.service";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: {
    absolute: `${BRAND.name} – the best restaurants for each dish in Islamabad and Rawalpindi`,
  },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const citySlug = await defaultCitySlug();
  const overview = citySlug ? await getCityOverview(citySlug) : null;

  if (!overview) {
    return (
      <Main width="full">
        <h1 className="font-display text-[28px] leading-[30px] font-extrabold tracking-[-0.015em] text-balance">
          Where&apos;s the best <span className="text-brand">chicken karahi</span> in Islamabad?
        </h1>
        <p className="text-muted-foreground">No city is set up yet.</p>
      </Main>
    );
  }

  return (
    <CityHome
      overview={overview}
      variant="home"
      fallbackTitle={
        <>
          Where&apos;s the best <span className="text-brand">chicken karahi</span> in{" "}
          {overview.city.name}?
        </>
      }
    />
  );
}
