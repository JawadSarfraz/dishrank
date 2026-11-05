import type { Metadata } from "next";
import { Main } from "@/components/layout/Page";
import { Prose } from "@/components/layout/Prose";
import { CDLA_PERMISSIVE_2_URL, OvertureCredit } from "@/components/layout";
import { getOvertureCredit } from "@/server/services/data-credits";
import { BRAND } from "@/lib/brand";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Data sources",
  description: `Where ${BRAND.name}'s rankings and restaurant listings come from, and the credits.`,
};

export default async function DataSourcesPage() {
  const credit = await getOvertureCredit();
  return (
    <Main width="narrow">
      <Prose>
        <h1>Data sources</h1>
        <p className="text-sm">
          Rankings come only from ratings by {BRAND.name} users. We import no scores or reviews from
          anywhere.
        </p>
        <p className="text-sm">
          Most restaurant listings come from Overture Maps places. Many are added automatically,
          with simple rules that tidy the name and drop places that look like duplicates or are not
          places to eat. Our team spot-checks them afterwards, and a page says so until it has been
          checked, so some listings may be out of date or wrong. Others are reviewed one by one or
          added by hand. A listing&apos;s phone number, website and map location may come from
          Overture. Which dishes a place from map data is shown under comes from its name or
          category, until diners rate them; those places are marked &ldquo;Not ranked yet&rdquo;.
        </p>
        <h2>Credits</h2>
        <OvertureCredit release={credit.release} accessedOn={credit.accessedOn} />
        <p className="text-sm">
          Licence text:{" "}
          <a href={CDLA_PERMISSIVE_2_URL} rel="license">
            Community Data License Agreement – Permissive, Version 2.0
          </a>
          .
        </p>
      </Prose>
    </Main>
  );
}
