// docs/04 in plain words. The numbers come from ranking.constants.ts, so the page and the algorithm
// never disagree.
import type { Metadata } from "next";
import { Main } from "@/components/layout/Page";
import { Prose } from "@/components/layout/Prose";
import Link from "next/link";
import { BURST, RANKING, TRUST } from "@/server/services/ranking.constants";
import { BRAND } from "@/lib/brand";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How rankings work",
  description: `How ${BRAND.name} turns diners' dish ratings into a ranking: recent ratings from different people, pulled toward the city average until there are enough of them.`,
  alternates: { canonical: "/how-rankings-work" },
};

const TRUST_ROWS: [string, string][] = [
  ["New account", TRUST.newAccount.toFixed(1)],
  [
    `At least ${TRUST.established.minActive} ratings, at ${TRUST.established.minRestaurants} or more restaurants`,
    TRUST.established.trust.toFixed(1),
  ],
  [
    `At least ${TRUST.trusted.minActive} ratings, ${TRUST.trusted.minPhotoShare * 100}% or more with a photo, none of them flagged`,
    TRUST.trusted.trust.toFixed(1),
  ],
  ["Panel member (trusted early raters chosen by our team)", TRUST.panel.toFixed(1)],
  [
    `${TRUST.penalised.minHidden} or more ratings removed by our team`,
    TRUST.penalised.trust.toFixed(1),
  ],
  ["Banned account", "ratings no longer count"],
  [
    "Set by our team for one rater, in exceptional cases",
    `${TRUST.min.toFixed(1)} to ${TRUST.max.toFixed(1)}, until we clear it`,
  ],
];

export default function HowRankingsWorkPage() {
  const { normal, bootstrap } = RANKING;
  return (
    <Main width="narrow">
      <Prose>
        <h1>How rankings work</h1>
        <p>
          {BRAND.name} ranks restaurants one dish at a time. A restaurant&apos;s place for Chicken
          Karahi comes only from ratings of its Chicken Karahi. In one sentence: the score is an
          average of recent ratings from different people, pulled toward the city average until
          there are enough of them.
        </p>

        <h2>Where the ratings come from</h2>
        <p>
          Every rating is a diner&apos;s opinion, a whole number from 1 to 10, given on {BRAND.name}
          . We import no scores, stars or reviews from anywhere else. Each person has one rating per
          dish per restaurant; rating it again replaces the old one. &quot;Votes&quot; on our pages
          means different people.
        </p>

        <h2>How much a rating counts</h2>
        <p>
          Recent ratings count more, because restaurants change. A rating counts half after{" "}
          {RANKING.halfLifeDays} days and a quarter after {RANKING.halfLifeDays * 2} days. A rating
          also counts more or less depending on the rater&apos;s trust level (below).
        </p>

        <h2>The score</h2>
        <p>
          A score starts from the city-wide average for that dish and moves toward the
          restaurant&apos;s own average as ratings come in. With few ratings it stays close to the
          city average (the average is counted as {RANKING.priorWeight} extra ratings); with many it
          is almost exactly the restaurant&apos;s own average. Until a dish has{" "}
          {RANKING.priorMinRatings} ratings across the city, the city average is taken as{" "}
          {RANKING.priorFallback}. So three perfect 10s from new accounts cannot put a restaurant on
          top.
        </p>

        <h2>Who gets a rank number</h2>
        <p>
          A restaurant gets a rank for a dish only when at least {normal.minRaters} different people
          have rated it there, their ratings together count for at least{" "}
          {normal.minWeight.toFixed(1)} (see above), and the dish is confirmed:{" "}
          {RANKING.promoteRaters} different people have rated it, or we have seen it on the menu, or
          the owner has confirmed it. Everything else is listed under &quot;Not enough votes
          yet&quot;, with how many more ratings it needs, and places nobody has rated yet are under
          &quot;Places to try&quot;. Neither ever gets a number.
        </p>
        <p>
          <strong>Early rankings.</strong> While a city is new on {BRAND.name} (before its launch
          and for {RANKING.bootstrapDays} days after it), a rank needs {bootstrap.minRaters}{" "}
          different people and a weight of {bootstrap.minWeight.toFixed(1)}. Those pages say
          &quot;Early rankings&quot;.
        </p>
        <p>
          Equal scores are ordered by more votes, then the most recent rating, then name. Rank
          numbers are for the whole city: filtering by area or sorting by price never renumbers
          them.
        </p>

        <h2>Trust levels</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Rater</th>
              <th scope="col">A rating counts</th>
            </tr>
          </thead>
          <tbody>
            {TRUST_ROWS.map(([who, weight]) => (
              <tr key={who}>
                <td>{who}</td>
                <td className="tabular-nums">{weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-muted-foreground">
          Trust levels are worked out again after each of your ratings and every night, except one
          our team set by hand. A rater whose last 10 ratings are all 10s or all 1s counts as a new
          account until that changes.
        </p>

        <h2>Keeping it fair</h2>
        <ul>
          <li>Owners cannot rate their own restaurant.</li>
          <li>Each account can rate only a limited number of dishes a day.</li>
          <li>
            When {BURST.ratings} or more accounts younger than {BURST.newAccountDays} days rate one
            dish at one restaurant within {BURST.windowHours} hours, those ratings stop counting
            until our team checks them.
          </li>
          <li>
            A comment with a phone number, a link or an e-mail address is checked by our team before
            the rating counts.
          </li>
          <li>
            Dishes nobody has rated or confirmed for a long time are marked as possibly no longer
            served and leave the ranking until someone rates them again.
          </li>
        </ul>

        <h2>When it updates</h2>
        <p>
          A new rating updates the restaurant&apos;s score and the ranking straight away. Every
          night we recompute everything, so older ratings slowly count less.
        </p>

        <p>
          Something wrong? <Link href="/dispute">Tell us on the dispute page</Link>.
        </p>
      </Prose>
    </Main>
  );
}
