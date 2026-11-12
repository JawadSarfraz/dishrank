// docs/01 trust rules: anyone can dispute a listing or a ranking. The form becomes a review item;
// the page itself is static.
import type { Metadata } from "next";
import { MessageSquareTextIcon } from "lucide-react";
import Link from "next/link";
import { Main } from "@/components/layout/Page";
import { Callout, Prose } from "@/components/layout/Prose";
import { DisputeForm } from "@/components/trust/DisputeForm";
import { BRAND } from "@/lib/brand";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Dispute a listing or ranking",
  description: `Tell us when a restaurant listing, a dish or a ranking on ${BRAND.name} is wrong.`,
  alternates: { canonical: "/dispute" },
};

export default function DisputePage() {
  return (
    <Main width="narrow">
      <Prose>
        <h1>Dispute a listing or ranking</h1>
        <p className="text-[17px] leading-[25px]">
          Own a restaurant, or think something here is wrong? Tell us. A person on our team reads
          every message. We can correct a listing, remove a dish a restaurant does not serve, or
          look at ratings that seem unfair.
        </p>
        <Callout icon={<MessageSquareTextIcon />}>
          <p className="text-sm leading-5">
            Ratings are diners&apos; opinions, so we do not change a score because someone disagrees
            with it. We do remove ratings that break{" "}
            <Link href="/how-rankings-work">our rules</Link>. We never publish your contact details.
          </p>
        </Callout>
        <DisputeForm />
      </Prose>
    </Main>
  );
}
