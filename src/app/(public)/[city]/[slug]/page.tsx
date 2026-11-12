// The ranking page /[city]/best-[dish] (docs/01, docs/04): Next.js has no partial segments, so this
// [slug] segment answers only slugs with the "best-" prefix. ISR, one cached page per city × dish:
// it never reads searchParams; the filter bar works on the rows in the browser.
//
// Layout (spec §5, "Dish page"): the dish header (no-photo band, or photo) with Back and Share, then
// the white sheet: status badge, the voting-open invitation with the "first four" seats or the
// podium, "Rate the places you know" (QuickRate), the lists, the small print. Everything outside the
// lists carries data-rate-hide, so it steps aside in rate mode (QuickRate swaps the lists itself).
import type { Metadata } from "next";
import { ClockIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DishIcon } from "@/components/brand/DishIcon";
import { DishHeader, DishTitle } from "@/components/dish/DishHeader";
import { hasDishPhoto } from "@/components/dish/DishMedia";
import { Podium } from "@/components/dish/Podium";
import { JsonLd } from "@/components/layout/JsonLd";
import { Contenders } from "@/components/ranking/Contenders";
import { romanUrduLine } from "@/components/home/featured-copy";
import { QuickRate } from "@/components/ranking/QuickRate";
import { RankingBrowser } from "@/components/ranking/RankingBrowser";
import { ShareButton } from "@/components/ranking/ShareButton";
import { ViewBeacon } from "@/components/ranking/ViewBeacon";
import { WaitingList } from "@/components/ranking/WaitingList";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineLink, Seats, SmallPrint } from "@/components/ui/kit";
import { BRAND } from "@/lib/brand";
import { formatPkDate, formatScore, formatVotes } from "@/lib/format";
import { dishPageIndexable } from "@/lib/indexing";
import { suggestPlacePath } from "@/lib/paths";
import { SLUG_PATTERN } from "@/lib/slug";
import { rankingJsonLd } from "@/server/seo";
import { getRankingPage } from "@/server/services/ranking.service";
import { shareImagePath, statusImagePath } from "@/server/services/share-image";
import { yearInPakistan } from "@/server/site";

export const revalidate = 3600;

/** Rendered on the first visit, then cached (no database at build time). */
export async function generateStaticParams() {
  return [];
}

const PREFIX = "best-";

const load = cache(async (citySlug: string, slug: string) => {
  const dishSlug = slug.startsWith(PREFIX) ? slug.slice(PREFIX.length) : "";
  if (!SLUG_PATTERN.test(dishSlug) || !SLUG_PATTERN.test(citySlug)) return null;
  return getRankingPage({ citySlug, dishSlug });
});

type Ranking = NonNullable<Awaited<ReturnType<typeof load>>>;

const pathOf = (r: Ranking) => `/${r.city.slug}/best-${r.dish.slug}`;
const titleOf = (r: Ranking) => `Best ${r.dish.name} in ${r.city.name}`;
/** While nothing ranks, the page, its link preview and its share text ask for the vote instead. */
const inviteOf = (r: Ranking) => `Vote: who makes the best ${r.dish.name} in ${r.city.name}?`;
/** Never promises exactly N (owner, 2026-11-13): the weight bar can ask for a few more ratings. */
const rankRule = (r: Ranking) =>
  `A place joins the ranking once at least ${r.thresholds.minRaters} diners have rated it.`;
/** "four", for the two rater thresholds the product has; any other number stays a digit. */
const inWords = (n: number) => ({ 4: "four", 8: "eight" })[n] ?? String(n);

/** The line under the title. When a count is zero it is not shown: the invitation is (docs/12). */
function summaryOf(r: Ranking) {
  const votes = r.eligible.reduce((sum, row) => sum + row.votes, 0);
  const waiting = r.insufficient.length;
  const places = r.listedTotal;
  if (r.eligible.length === 0) {
    if (waiting > 0) {
      return `${waiting} restaurant${waiting === 1 ? "" : "s"} collecting votes · ${rankRule(r)}`;
    }
    return places > 0
      ? `${places} contender${places === 1 ? "" : "s"}. Voting is open.`
      : "We're picking the contenders.";
  }
  const ranked = `${r.eligible.length} restaurant${r.eligible.length === 1 ? "" : "s"} ranked from ${formatVotes(votes)}`;
  return waiting > 0 ? `${ranked} · ${waiting} more collecting votes` : ranked;
}

/** "1. Butt Karahi (8.3), 2. …" for share text and descriptions; votes in early rankings. */
const topThree = (r: Ranking) =>
  r.eligible
    .slice(0, 3)
    .map((row) => {
      const detail = r.mode === "bootstrap" ? formatVotes(row.votes) : formatScore(row.score);
      return `${row.rank}. ${row.restaurant.name} (${detail})`;
    })
    .join(", ");

export async function generateMetadata({ params }: PageProps<"/[city]/[slug]">): Promise<Metadata> {
  const { city, slug } = await params;
  const ranking = await load(city, slug);
  if (!ranking) return { title: "Not found", robots: { index: false } };
  // Nothing ranked yet: the preview WhatsApp shows under a shared link is an invitation to vote,
  // never a count of what is missing (the page is noindex meanwhile, so the title can say so too).
  const open = ranking.eligible.length === 0;
  const title = open ? inviteOf(ranking) : `${titleOf(ranking)} (${yearInPakistan()})`;
  const description = open
    ? `${summaryOf(ranking)} ${rankRule(ranking)} Rate the ones you've tried.`
    : `${summaryOf(ranking)}. Top: ${topThree(ranking)}. Ranked by dish from diners' ratings.`;
  const image = shareImagePath(ranking);
  return {
    title,
    description,
    alternates: { canonical: pathOf(ranking) },
    openGraph: {
      title: `${title} · ${BRAND.name}`,
      description,
      url: pathOf(ranking),
      type: "website",
      siteName: BRAND.name,
      images: [
        { url: image, width: 1200, height: 630, alt: `${titleOf(ranking)} on ${BRAND.name}` },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${BRAND.name}`,
      description,
      images: [image],
    },
    // Fewer than three ranked restaurants: out of search results (still linked and crawled).
    ...(dishPageIndexable(ranking.eligible.length)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

/** The status badge (spec §4): "New list · 4+ votes rank a place", or "Early ranking · 7 of 14 places
 * ranked" (M is every place on the list, at least the N ranked ones, so never zero). */
function StatusBadge({ ranking }: { ranking: Ranking }) {
  const { eligible, thresholds, mode, listedTotal } = ranking;
  if (eligible.length === 0) {
    return (
      <Badge dot>
        <span>
          <span>New list</span> · {thresholds.minRaters}+ votes rank a place
        </span>
      </Badge>
    );
  }
  const places = Math.max(listedTotal, eligible.length);
  const ranked = `${eligible.length} of ${places} place${places === 1 ? "" : "s"} ranked`;
  return <Badge dot>{mode === "bootstrap" ? `Early ranking · ${ranked}` : ranked}</Badge>;
}

/** Voting open (spec §4, "First four" seats): who has rated the place closest to a rank, as seats. */
function SeatsBlock({ ranking, raters }: { ranking: Ranking; raters: number }) {
  const { minRaters } = ranking.thresholds;
  const filled = Math.min(raters, minRaters);
  return (
    <div className="flex flex-col gap-3 rounded-card bg-blush p-4">
      {/* Seats only while they fit at 360 px; past five the sentence says it alone. */}
      {minRaters <= 5 && (
        <Seats total={minRaters} filled={filled} you={filled >= minRaters ? "none" : "invite"} />
      )}
      <p className="text-sm leading-5">
        {raters === 0 ? (
          <>
            <strong className="font-bold">Pehla vote aap ka?</strong> A place joins the ranking once
            at least {minRaters} diners have rated it.
          </>
        ) : (
          <>
            {raters < minRaters
              ? `${raters} of ${minRaters} raters so far for`
              : "A few more ratings for"}{" "}
            the first ranked {ranking.dish.name} in {ranking.city.name}.
          </>
        )}
      </p>
    </div>
  );
}

export default async function RankingPage({ params }: PageProps<"/[city]/[slug]">) {
  const { city, slug } = await params;
  const ranking = await load(city, slug);
  if (!ranking) notFound();
  const { eligible, insufficient, contenders, thresholds, mode } = ranking;
  const shareLead =
    eligible.length > 0
      ? `${titleOf(ranking)}, ranked by diners on ${BRAND.name}: ${topThree(ranking)}`
      : `${inviteOf(ranking)} ${rankRule(ranking)}`;
  const shareText = `${shareLead}\n\n${BRAND.shareCall}`;
  const rateHref = `/rate?city=${ranking.city.slug}`;
  const empty = eligible.length === 0 && insufficient.length === 0 && contenders.length === 0;
  const isRanked = eligible.length > 0;
  const photo = hasDishPhoto(ranking.dish.slug);
  const shareLabel = isRanked ? "Share this ranking" : "Share this list";
  const share = { title: titleOf(ranking), text: shareText, path: pathOf(ranking) };
  const restaurantPath = (restaurantSlug: string) => `/${ranking.city.slug}/r/${restaurantSlug}`;

  const badge = (
    <div className="flex flex-col items-start gap-2">
      <StatusBadge ranking={ranking} />
      {ranking.featured?.closingLine && (
        <p className="flex items-center gap-1.5 text-[13px] leading-[18px] font-semibold text-brand-dark">
          <ClockIcon aria-hidden="true" className="size-4 shrink-0" />
          {ranking.featured.closingLine}
        </p>
      )}
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col sm:px-6 sm:pt-6">
      <DishHeader
        city={ranking.city}
        dish={ranking.dish}
        title={titleOf(ranking)}
        share={{ ...share, label: shareLabel }}
        photo={photo}
      />

      {/* The sheet overlaps the header by 28 px; in rate mode the header steps aside, so it does not. */}
      <div className="relative -mt-7 flex flex-col rounded-t-sheet bg-background px-4 pt-5 pb-7 sm:px-6 [body[data-rate-mode]_&]:mt-0">
        <div data-rate-hide="" className="flex flex-col">
          {photo ? (
            <DishTitle
              city={ranking.city}
              dish={ranking.dish}
              title={titleOf(ranking)}
              badge={badge}
            />
          ) : (
            badge
          )}

          {isRanked ? (
            <>
              <p className="mt-2.5 text-[15px] leading-5 text-muted-foreground">
                Ranked by people who ate there.
              </p>
              <div className="mt-5">
                <Podium
                  places={eligible.slice(0, 3).map((row) => ({
                    rank: row.rank,
                    href: restaurantPath(row.restaurant.slug),
                    name: row.restaurant.name,
                    area: row.restaurant.area?.name ?? null,
                    votes: row.votes,
                    score: row.score,
                  }))}
                />
              </div>
            </>
          ) : (
            ranking.firstRankRaters !== null && (
              <>
                <p className="mt-2.5 text-base leading-[23px]">
                  {ranking.firstRankRaters === 0
                    ? `Be one of the first ${inWords(thresholds.minRaters)} to rate. You decide the first ranking.`
                    : summaryOf(ranking)}
                </p>
                <div className="mt-4">
                  <SeatsBlock ranking={ranking} raters={ranking.firstRankRaters} />
                </div>
              </>
            )
          )}
        </div>

        <div className="mt-4 flex flex-col gap-7">
          <QuickRate
            citySlug={ranking.city.slug}
            dishSlug={ranking.dish.slug}
            seed={ranking.shuffleSeed}
            // Ranked lists ask the spec's question when it reads right for the dish (spec §5).
            {...(isRanked && romanUrduLine(ranking.dish.slug)
              ? { helper: romanUrduLine(ranking.dish.slug) }
              : {})}
          >
            {isRanked && (
              <RankingBrowser
                citySlug={ranking.city.slug}
                updated={ranking.lastRatedAt ? formatPkDate(ranking.lastRatedAt) : null}
                rows={eligible.map((row) => ({
                  rank: row.rank,
                  slug: row.restaurant.slug,
                  name: row.restaurant.name,
                  area: row.restaurant.area,
                  score: row.score,
                  votes: row.votes,
                  price: row.price,
                  tags: row.variantTags,
                  lat: row.restaurant.lat,
                  lng: row.restaurant.lng,
                }))}
              />
            )}

            {empty && (
              <EmptyState
                icon={<DishIcon slug={ranking.dish.slug} size={26} />}
                title="We're picking the contenders"
                text="Know a place that belongs here? Tell us. Or rate a place you've eaten at: it joins the list with your vote."
                action={{ href: suggestPlacePath(ranking.city.slug), label: "Tell us" }}
                secondary={{ href: rateHref, label: `Rate ${ranking.dish.name} somewhere` }}
              />
            )}

            {/* Nothing ranked: the places collecting votes, then the contenders, each its own list. */}
            {!isRanked && insufficient.length > 0 && (
              <WaitingList
                citySlug={ranking.city.slug}
                dishSlug={ranking.dish.slug}
                dishName={ranking.dish.name}
                minRaters={thresholds.minRaters}
                leadIn
                rows={insufficient.map((row) => ({
                  id: row.restaurantDishId,
                  slug: row.restaurant.slug,
                  name: row.restaurant.name,
                  area: row.restaurant.area?.name ?? null,
                  votes: row.votes,
                  ranksNext: row.ratingsNeeded === 0,
                }))}
              />
            )}

            {!isRanked && contenders.length > 0 && (
              <Contenders
                citySlug={ranking.city.slug}
                dishSlug={ranking.dish.slug}
                minRaters={thresholds.minRaters}
                total={ranking.contendersTotal}
                rows={contenders}
              />
            )}

            {/* Ranked: one "Still need votes" list, the places with raters first. */}
            {isRanked && (insufficient.length > 0 || contenders.length > 0) && (
              <Contenders
                variant="ranked"
                citySlug={ranking.city.slug}
                dishSlug={ranking.dish.slug}
                minRaters={thresholds.minRaters}
                total={ranking.contendersTotal}
                rows={contenders}
                waiting={insufficient.map((row) => ({
                  id: row.restaurantDishId,
                  slug: row.restaurant.slug,
                  name: row.restaurant.name,
                  area: row.restaurant.area,
                  lat: row.restaurant.lat,
                  lng: row.restaurant.lng,
                  votes: row.votes,
                  ranksNext: row.ratingsNeeded === 0,
                }))}
              />
            )}
          </QuickRate>

          <div data-rate-hide="" className="flex flex-col gap-5">
            <SmallPrint>
              A place joins the ranking once at least {thresholds.minRaters} diners have rated it.
              {isRanked && " Recent votes count more."}
              {mode === "bootstrap" &&
                ` While ${ranking.city.name} is new, fewer votes are needed.`}{" "}
              Scores are diners&apos; opinions, not facts about a restaurant.{" "}
              <InlineLink href="/how-rankings-work">How rankings work</InlineLink>
            </SmallPrint>

            <ShareButton
              city={ranking.city.slug}
              dish={ranking.dish.slug}
              title={share.title}
              text={share.text}
              path={share.path}
              label={shareLabel}
              statusImage={statusImagePath(ranking)}
            />
          </div>
        </div>
      </div>
      <ViewBeacon city={ranking.city.slug} dish={ranking.dish.slug} />

      {isRanked && (
        <JsonLd
          data={rankingJsonLd({
            title: titleOf(ranking),
            path: pathOf(ranking),
            items: eligible.map((row) => ({
              rank: row.rank,
              slug: row.restaurant.slug,
              name: row.restaurant.name,
              citySlug: ranking.city.slug,
              cityName: ranking.city.name,
              areaName: row.restaurant.area?.name ?? null,
              lat: row.restaurant.lat,
              lng: row.restaurant.lng,
            })),
          })}
        />
      )}
    </main>
  );
}
