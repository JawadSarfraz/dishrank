import type { Metadata } from "next";
import { CDLA_PERMISSIVE_2_URL, OvertureCredit } from "@/components/layout";
import { getOvertureCredit } from "@/server/services/data-credits";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Data sources · DishRank",
  description: "Where DishRank's rankings and restaurant listings come from, and the credits.",
};

export default async function DataSourcesPage() {
  const credit = await getOvertureCredit();
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Data sources</h1>
      <p className="text-sm">
        Rankings come only from ratings by DishRank users. We import no scores or reviews from
        anywhere.
      </p>
      <p className="text-sm">
        Many restaurant listings start from Overture Maps places. Our team reviews each one before
        it is published, correcting the name, address and area; some restaurants are added by hand.
        A listing&apos;s phone number, website and map location may come from Overture.
      </p>
      <h2 className="text-lg font-semibold">Credits</h2>
      <OvertureCredit release={credit.release} accessedOn={credit.accessedOn} />
      <p className="text-sm">
        Licence text:{" "}
        <a href={CDLA_PERMISSIVE_2_URL} className="underline" rel="license">
          Community Data License Agreement – Permissive, Version 2.0
        </a>
        .
      </p>
    </main>
  );
}
