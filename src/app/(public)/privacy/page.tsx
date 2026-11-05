// Plain-language privacy draft (docs/08 Phase 4). Not reviewed by a lawyer yet: the banner says so.
import type { Metadata } from "next";
import { Main } from "@/components/layout/Page";
import { Prose } from "@/components/layout/Prose";
import Link from "next/link";
import { LegalDraftNotice } from "@/components/trust/LegalDraftNotice";
import { ContactEmail, OperatorName } from "@/components/trust/Operator";
import { BRAND } from "@/lib/brand";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${BRAND.name} keeps about you, why, and how to have it deleted.`,
  alternates: { canonical: "/privacy" },
  // Decided 2026-11-04: kept out of search results until a lawyer has reviewed the draft.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <Main width="narrow">
      <Prose>
        <h1>Privacy</h1>
        <LegalDraftNotice />
        <p>
          This page says what {BRAND.name} keeps about you and why. We keep as little as we can, we
          do not sell it, and we show no ads.
        </p>

        <h2>Who we are</h2>
        <p>
          {BRAND.name} is run by <OperatorName />. For anything about your data, write to{" "}
          <ContactEmail />.
        </p>

        <h2>Your account</h2>
        <p>
          You sign in with Google. Google tells us your name, e-mail address and profile picture; we
          never see your Google password. A cookie keeps you signed in. With each sign-in we keep
          the IP address and browser it came from, to protect your account; that record is deleted
          when the sign-in expires, after a week without use.
        </p>

        <h2>Your ratings, comments and photos</h2>
        <p>
          When you rate a dish we keep your score, the optional taste, portion and value scores,
          your comment and your photo, with a scrambled (hashed) form of your IP address that helps
          us spot abuse. Your scores count toward the public rankings without your name. Comments
          and photos are checked by our team and may be shown on public pages; your e-mail address
          is never shown. When you upload a photo on {BRAND.name}, the app re-saves it in your
          browser first, which removes the location and camera details stored inside the file. A
          photo is stored under a random name that says nothing about you; a photo you upload but
          never use is deleted after a day.
        </p>

        <h2>Locations</h2>
        <p>
          &quot;Near me&quot; uses your location only inside your browser to sort the list. It is
          never sent to us.
        </p>
        <p>
          Panel members (trusted raters chosen by our team) can choose to share their location while
          they are at a restaurant. We keep that location with the restaurant, not with the rating,
          and use it only to correct where the restaurant is on the map.
        </p>

        <h2>Restaurant owners</h2>
        <p>
          If you claim a restaurant, we keep the phone number and note you send so our team can call
          to check it. An owner sees how their dishes score and rank, never who rated them.
        </p>

        <h2>Counting visits</h2>
        <p>
          To see which pages are useful we count, per day, ratings saved, searches and views of
          ranking pages, with only the city and dish. These counts hold nothing about you: no
          account, no IP address, no search words, no time of day. We use no third-party tracking or
          advertising cookies.
        </p>

        <h2>Reports and disputes</h2>
        <p>
          When you report a problem or send a dispute we keep what you wrote and any contact details
          you gave, so our team can act on it and reply. A dispute sent without signing in keeps a
          hashed IP address, so the form cannot be flooded.
        </p>

        <h2>Who else handles it</h2>
        <p>
          Our service providers store and process this data for us: Google (sign-in), Supabase
          (database and photo storage) and Vercel (hosting). Menu photos are read by an AI model
          from Anthropic to list the dishes on them. We share nothing else, with anyone, unless the
          law requires it.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Your account, ratings and photos stay until you delete them or ask us to. Counters that
          enforce daily limits are deleted after two days. The scrambled IP addresses that protect
          those limits use their own secret key.
        </p>

        <h2>Deleting your data</h2>
        <p>
          You can delete any of your ratings from <Link href="/me">My ratings</Link>; its comment,
          photo and earlier versions go with it (a copy of the photo can stay in a browser or
          network cache for a short while).
        </p>
        <p>
          To delete your whole account, open <Link href="/me">My ratings</Link> and choose
          &quot;Delete my account&quot;. This deletes your account and sign-in, all your ratings,
          comments and photos (the rankings are recomputed without them), your restaurant claims,
          and the reports and suggestions our team has not looked at yet. Menu photos you sent stay
          with their restaurant without your name, and a decision our team already made on something
          you reported or claimed stays on record without your name, phone number or contact
          details. If you cannot sign in any more, write to <ContactEmail /> from the e-mail address
          you used.
        </p>
        <p>
          If our team has banned your account, you can still delete it the same way. We then keep
          only a scrambled (hashed) form of your e-mail address on a ban list, so that the same
          Google account cannot sign up again. The hash cannot be turned back into your address.
        </p>
      </Prose>
    </Main>
  );
}
