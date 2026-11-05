// docs/01 trust rules: anyone can dispute a listing or a ranking. The form becomes a review item;
// the page itself is static.
import type { Metadata } from "next";
import { Main } from "@/components/layout/Page";
import { Prose } from "@/components/layout/Prose";
import Link from "next/link";
import { DisputeForm } from "@/components/trust/DisputeForm";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Dispute a listing or ranking",
  description: "Tell us when a restaurant listing, a dish or a ranking on DishRank is wrong.",
  alternates: { canonical: "/dispute" },
};

export default function DisputePage() {
  return (
    <Main width="narrow">
      <Prose>
        <h1>Dispute a listing or ranking</h1>
        <p>
          Own a restaurant, or think something here is wrong? Tell us. A person on our team reads
          every message. We can correct a listing, remove a dish a restaurant does not serve, or
          look at ratings that seem unfair.
        </p>
        <p className="text-sm text-muted-foreground">
          Ratings are diners&apos; opinions, so we do not change a score because someone disagrees
          with it. We do remove ratings that break <Link href="/how-rankings-work">our rules</Link>.
          We never publish your contact details.
        </p>
        <DisputeForm />
      </Prose>
    </Main>
  );
}
