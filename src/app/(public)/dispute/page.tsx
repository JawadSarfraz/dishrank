// docs/01 trust rules: anyone can dispute a listing or a ranking. The form becomes a review item;
// the page itself is static.
import type { Metadata } from "next";
import Link from "next/link";
import { DisputeForm } from "@/components/trust/DisputeForm";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Dispute a listing or ranking – DishRank",
  description: "Tell us when a restaurant listing, a dish or a ranking on DishRank is wrong.",
  alternates: { canonical: "/dispute" },
};

export default function DisputePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8 text-base">
      <h1 className="text-2xl font-bold">Dispute a listing or ranking</h1>
      <p>
        Own a restaurant, or think something here is wrong? Tell us. A person on our team reads
        every message. We can correct a listing, remove a dish a restaurant does not serve, or look
        at ratings that seem unfair.
      </p>
      <p className="text-sm text-muted-foreground">
        Ratings are diners&apos; opinions, so we do not change a score because someone disagrees
        with it. We do remove ratings that break{" "}
        <Link href="/how-rankings-work" className="underline">
          our rules
        </Link>
        . We never publish your contact details.
      </p>
      <DisputeForm />
    </main>
  );
}
