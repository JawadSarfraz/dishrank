// The ranking page /[city]/best-[dish] (docs/01, docs/04): Next.js has no partial segments, so this
// [slug] segment answers only slugs with the "best-" prefix. ISR, one cached page per city × dish:
// it never reads searchParams; the filter bar works on the rows in the browser.
import type { Metadata } from "next";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DishIcon } from "@/components/brand/DishIcon";
import { JsonLd } from "@/components/layout/JsonLd";
import { Main } from "@/components/layout/Page";
import { Contenders } from "@/components/ranking/Contenders";
import { suggestPlacePath } from "@/lib/paths";
import { QuickRate } from "@/components/ranking/QuickRate";
import { RankingBrowser } from "@/components/ranking/RankingBrowser";
import { ShareButton } from "@/components/ranking/ShareButton";
import { ViewBeacon } from "@/components/ranking/ViewBeacon";
import { WaitingList } from "@/components/ranking/WaitingList";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { BRAND } from "@/lib/brand";
import { formatScore, formatVotes } from "@/lib/format";
import { SLUG_PATTERN } from "@/lib/slug";
import { rankingJsonLd } from "@/server/seo";
import { getRankingPage } from "@/server/services/ranking.service";
import { shareImagePath } from "@/server/services/share-image";
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
const rankRule = (r: Ranking) => `${r.thresholds.minRaters} votes put a place on the list.`;
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
    // A page that ranks nobody yet stays out of search results (it is still linked and crawled).
    ...(ranking.eligible.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
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

  return (
    <Main className="min-h-dvh gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        <Link
          href={`/${ranking.city.slug}`}
          className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline"
        >
          {ranking.city.name}
        </Link>
        <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">{ranking.dish.name}</span>
      </nav>
      <header className="flex flex-col gap-3">
        {mode === "bootstrap" && (
          <Badge className="w-fit">
            <span>New list</span>
            <span aria-hidden="true"> · {thresholds.minRaters} votes rank a place</span>
          </Badge>
        )}
        <div className="flex items-start gap-3">
          <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <DishIcon slug={ranking.dish.slug} size={26} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-3xl font-extrabold break-anywhere sm:text-4xl">
              {titleOf(ranking)}
            </h1>
            <p className="text-base text-muted-foreground">{summaryOf(ranking)}</p>
            {ranking.featured?.closingLine && (
              <p className="text-sm font-medium text-brand">{ranking.featured.closingLine}</p>
            )}
          </div>
        </div>
      </header>

      {ranking.firstRankRaters !== null &&
        (ranking.firstRankRaters === 0 ? (
          <p className="font-medium">
            Be one of the first {inWords(thresholds.minRaters)} to rate. You decide the first
            ranking.
          </p>
        ) : (
          <p className="font-medium">
            {ranking.firstRankRaters < thresholds.minRaters
              ? `${ranking.firstRankRaters} of ${thresholds.minRaters} raters so far for`
              : "A few more ratings for"}{" "}
            the first ranked {ranking.dish.name} in {ranking.city.name}
          </p>
        ))}

      <QuickRate
        citySlug={ranking.city.slug}
        dishSlug={ranking.dish.slug}
        seed={ranking.shuffleSeed}
      >
        {eligible.length > 0 && (
          <RankingBrowser
            citySlug={ranking.city.slug}
            dishSlug={ranking.dish.slug}
            early={mode === "bootstrap"}
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

        {insufficient.length > 0 && (
          <WaitingList
            citySlug={ranking.city.slug}
            dishSlug={ranking.dish.slug}
            dishName={ranking.dish.name}
            minRaters={thresholds.minRaters}
            leadIn={eligible.length === 0}
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

        {contenders.length > 0 && (
          <Contenders
            citySlug={ranking.city.slug}
            dishSlug={ranking.dish.slug}
            total={ranking.contendersTotal}
            rows={contenders}
          />
        )}
      </QuickRate>

      <p className="text-sm text-muted-foreground">
        A restaurant gets a rank for this dish once at least {thresholds.minRaters} different people
        have rated it there; recent votes and trusted raters count more.
        {mode === "bootstrap" && ` While ${ranking.city.name} is new, fewer votes are needed.`}{" "}
        <Link
          href="/how-rankings-work"
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          How rankings work
        </Link>
      </p>

      <ShareButton
        city={ranking.city.slug}
        dish={ranking.dish.slug}
        title={titleOf(ranking)}
        text={shareText}
        path={pathOf(ranking)}
      />
      <ViewBeacon city={ranking.city.slug} dish={ranking.dish.slug} />

      {eligible.length > 0 && (
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
    </Main>
  );
}
