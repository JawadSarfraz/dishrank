import type { Metadata } from "next";
import { Main } from "@/components/layout/Page";
import { RateFlow } from "@/components/rate/RateFlow";
import { getSessionUser } from "@/server/auth";
import { getRatePageData } from "@/server/services/rate-page.service";

export const metadata: Metadata = {
  title: "Rate a dish",
  robots: { index: false, follow: false },
};

export default async function RatePage({ searchParams }: PageProps<"/rate">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const data = await getRatePageData(await getSessionUser(), {
    city: one(params.city),
    r: one(params.r),
    d: one(params.d),
    score: one(params.score),
    suggest: one(params.suggest),
  });
  return (
    <Main width="narrow" className="gap-4 pt-4">
      {/* Each step's title is the page's h1 (RateFlow). */}
      <RateFlow data={data} />
    </Main>
  );
}
