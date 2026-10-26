// Plain-language privacy draft (docs/08 Phase 4). Not reviewed by a lawyer yet: the banner says so.
import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftNotice } from "@/components/trust/LegalDraftNotice";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Privacy – DishRank",
  description: "What DishRank keeps about you, why, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
  // DECISION-PENDING: kept out of search results until a lawyer has reviewed the draft.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8 text-base">
      <h1 className="text-2xl font-bold">Privacy</h1>
      <LegalDraftNotice />
      <p>
        This page says what DishRank keeps about you and why. We keep as little as we can, we do not
        sell it, and we show no ads.
      </p>

      <h2 className="text-lg font-semibold">Your account</h2>
      <p>
        You sign in with Google. Google tells us your name, e-mail address and profile picture; we
        never see your Google password. A cookie keeps you signed in. With each sign-in we keep the
        IP address and browser it came from, to protect your account.
      </p>

      <h2 className="text-lg font-semibold">Your ratings, comments and photos</h2>
      <p>
        When you rate a dish we keep your score, the optional taste, portion and value scores, your
        comment and your photo, with a scrambled (hashed) form of your IP address that helps us spot
        abuse. Your scores count toward the public rankings without your name. Comments and photos
        are checked by our team and may be shown on public pages; your e-mail address is never
        shown. Before a photo is uploaded, the app re-saves it in your browser, which removes the
        location and camera details stored inside the file.
      </p>

      <h2 className="text-lg font-semibold">Locations</h2>
      <p>
        &quot;Near me&quot; uses your location only inside your browser to sort the list. It is
        never sent to us.
      </p>
      <p>
        Panel members (trusted raters chosen by our team) can choose to share their location while
        they are at a restaurant. We keep that location with the restaurant, not with the rating,
        and use it only to correct where the restaurant is on the map.
      </p>

      <h2 className="text-lg font-semibold">Reports and disputes</h2>
      <p>
        When you report a problem or send a dispute we keep what you wrote and any contact details
        you gave, so our team can act on it and reply. A dispute sent without signing in keeps a
        hashed IP address, so the form cannot be flooded.
      </p>

      <h2 className="text-lg font-semibold">Who else handles it</h2>
      <p>
        Our service providers store and process this data for us: Google (sign-in), Supabase
        (database and photo storage) and Vercel (hosting). Menu photos are read by an AI model from
        Anthropic to list the dishes on them. We share nothing else, with anyone, unless the law
        requires it.
      </p>

      <h2 className="text-lg font-semibold">How long we keep it</h2>
      <p>
        Your account, ratings and photos stay until you delete them or ask us to. Counters that
        enforce daily limits are deleted after two days.
      </p>

      <h2 className="text-lg font-semibold">Deleting your data</h2>
      <p>
        You can delete any of your ratings from{" "}
        <Link href="/me" className="underline">
          My ratings
        </Link>
        ; its comment and earlier versions go with it. To delete your whole account, or a photo file
        we still store, send a request from the{" "}
        <Link href="/dispute" className="underline">
          dispute page
        </Link>{" "}
        with the e-mail address you sign in with.
      </p>
    </main>
  );
}
