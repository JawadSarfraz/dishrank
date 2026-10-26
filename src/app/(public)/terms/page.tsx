// Terms of use draft (docs/08 Phase 4). Not reviewed by a lawyer yet: the banner says so.
import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftNotice } from "@/components/trust/LegalDraftNotice";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Terms of use – DishRank",
  description: "The rules for using DishRank and rating dishes.",
  alternates: { canonical: "/terms" },
  // DECISION-PENDING: kept out of search results until a lawyer has reviewed the draft.
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8 text-base">
      <h1 className="text-2xl font-bold">Terms of use</h1>
      <LegalDraftNotice />

      <h2 className="text-lg font-semibold">Rating dishes</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>Rate only dishes you have eaten, and give your honest opinion.</li>
        <li>Use one account. Do not rate a restaurant you own or work for.</li>
        <li>Do not pay, or accept payment or free food, for ratings.</li>
        <li>
          Keep comments about the food. No phone numbers, links, personal details of other people,
          insults or anything unlawful.
        </li>
      </ul>
      <p>
        We may hold or remove ratings, comments and photos that break these rules, and close
        accounts that keep breaking them. The rules we apply are on{" "}
        <Link href="/how-rankings-work" className="underline">
          how rankings work
        </Link>
        .
      </p>

      <h2 className="text-lg font-semibold">What you post</h2>
      <p>
        Your comments and photos stay yours. By posting them you allow DishRank to show them on its
        pages and to use them to rank dishes. Post only photos you took yourself.
      </p>

      <h2 className="text-lg font-semibold">What the rankings are</h2>
      <p>
        Scores and rankings are summaries of diners&apos; opinions. They are not statements of fact
        about any restaurant. Listings can be out of date or wrong; please tell us on the{" "}
        <Link href="/dispute" className="underline">
          dispute page
        </Link>
        . DishRank is provided as it is, without promises that it is complete or always available.
      </p>

      <h2 className="text-lg font-semibold">Your data</h2>
      <p>
        The{" "}
        <Link href="/privacy" className="underline">
          privacy page
        </Link>{" "}
        explains what we keep and how to delete it.
      </p>
    </main>
  );
}
