import type { Metadata } from "next";
import { RateFlow } from "@/components/rate/RateFlow";
import { getSessionUser } from "@/server/auth";
import { getRatePageData } from "@/server/services/rate-page.service";

export const metadata: Metadata = {
  title: "Rate a dish · DishRank",
  robots: { index: false, follow: false },
};

export default async function RatePage({ searchParams }: PageProps<"/rate">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const data = await getRatePageData(await getSessionUser(), {
    city: one(params.city),
    r: one(params.r),
    d: one(params.d),
  });
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Rate a dish</h1>
      <RateFlow data={data} />
    </main>
  );
}
