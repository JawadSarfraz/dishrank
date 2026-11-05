// Terms of use draft (docs/08 Phase 4). Not reviewed by a lawyer yet: the banner says so.
import type { Metadata } from "next";
import { Main } from "@/components/layout/Page";
import { Prose } from "@/components/layout/Prose";
import Link from "next/link";
import { LegalDraftNotice } from "@/components/trust/LegalDraftNotice";
import { ContactEmail, OperatorName } from "@/components/trust/Operator";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using DishRank and rating dishes.",
  alternates: { canonical: "/terms" },
  // Decided 2026-11-04: kept out of search results until a lawyer has reviewed the draft.
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <Main width="narrow">
      <Prose>
        <h1>Terms of use</h1>
        <LegalDraftNotice />
        <p>
          DishRank is run by <OperatorName />. Questions about these terms: <ContactEmail />.
        </p>

        <h2>Rating dishes</h2>
        <ul>
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
          <Link href="/how-rankings-work">how rankings work</Link>.
        </p>

        <h2>What you post</h2>
        <p>
          Your comments and photos stay yours. By posting them you allow DishRank to show them on
          its pages and to use them to rank dishes. Post only photos you took yourself.
        </p>

        <h2>What the rankings are</h2>
        <p>
          Scores and rankings are summaries of diners&apos; opinions. They are not statements of
          fact about any restaurant. Listings can be out of date or wrong; please tell us on the{" "}
          <Link href="/dispute">dispute page</Link>. DishRank is provided as it is, without promises
          that it is complete or always available.
        </p>

        <h2>Your data</h2>
        <p>
          The <Link href="/privacy">privacy page</Link> explains what we keep and how to delete it.
        </p>
      </Prose>
    </Main>
  );
}
