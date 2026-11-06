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
import { PlacesToTry } from "@/components/ranking/PlacesToTry";
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

function summaryOf(r: Ranking) {
  const votes = r.eligible.reduce((sum, row) => sum + row.votes, 0);
  const waiting = r.insufficient.length;
  const places = r.placesToTryTotal;
  if (r.eligible.length === 0) {
    if (waiting > 0) {
      return `${waiting} restaurant${waiting === 1 ? " is" : "s are"} collecting votes. None has enough yet.`;
    }
    return places > 0
      ? `${places} place${places === 1 ? "" : "s"} to try. None has a vote yet.`
      : `No restaurant has votes for ${r.dish.name} in ${r.city.name} yet.`;
  }
  const ranked = `${r.eligible.length} restaurant${r.eligible.length === 1 ? "" : "s"} ranked from ${formatVotes(votes)}`;
  return waiting > 0 ? `${ranked} · ${waiting} more collecting votes` : ranked;
}

/** "1. Butt Karahi (8.3), 2. …" for share text and descriptions. */
const topThree = (r: Ranking) =>
  r.eligible
    .slice(0, 3)
    .map((row) => `${row.rank}. ${row.restaurant.name} (${formatScore(row.score)})`)
    .join(", ");

export async function generateMetadata({ params }: PageProps<"/[city]/[slug]">): Promise<Metadata> {
  const { city, slug } = await params;
  const ranking = await load(city, slug);
  if (!ranking) return { title: "Not found", robots: { index: false } };
  const title = `${titleOf(ranking)} (${yearInPakistan()})`;
  const description =
    ranking.eligible.length > 0
      ? `${summaryOf(ranking)}. Top: ${topThree(ranking)}. Ranked by dish from diners' ratings.`
      : `${summaryOf(ranking)} Rate ${ranking.dish.name} to help rank the restaurants.`;
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
    },
    twitter: { card: "summary_large_image", title: `${title} · ${BRAND.name}`, description },
    // A page that ranks nobody yet stays out of search results (it is still linked and crawled).
    ...(ranking.eligible.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function RankingPage({ params }: PageProps<"/[city]/[slug]">) {
  const { city, slug } = await params;
  const ranking = await load(city, slug);
  if (!ranking) notFound();
  const { eligible, insufficient, placesToTry, thresholds, mode } = ranking;
  const shareText =
    eligible.length > 0
      ? `${titleOf(ranking)}, ranked by diners on ${BRAND.name}: ${topThree(ranking)}`
      : `${titleOf(ranking)}: help rank them on ${BRAND.name}`;
  const rateHref = `/rate?city=${ranking.city.slug}`;

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
            <span>Early rankings</span>
            <span aria-hidden="true"> · {thresholds.minRaters} raters needed</span>
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
          </div>
        </div>
      </header>

      <QuickRate citySlug={ranking.city.slug} dishSlug={ranking.dish.slug} />

      {eligible.length > 0 && (
        <RankingBrowser
          citySlug={ranking.city.slug}
          dishSlug={ranking.dish.slug}
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

      {eligible.length === 0 && insufficient.length === 0 && placesToTry.length === 0 && (
        <EmptyState
          icon={<DishIcon slug={ranking.dish.slug} size={26} />}
          title={`Nobody has rated ${ranking.dish.name} in ${ranking.city.name} yet`}
          text={`Be the first. It takes four taps, and the restaurant ranks once ${thresholds.minRaters} people have rated it.`}
          action={{ href: rateHref, label: `Rate ${ranking.dish.name}` }}
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
            ratingsNeeded: row.ratingsNeeded,
          }))}
        />
      )}

      {placesToTry.length > 0 && (
        <PlacesToTry
          citySlug={ranking.city.slug}
          dishSlug={ranking.dish.slug}
          total={ranking.placesToTryTotal}
          fromMapData={ranking.placesFromMapData}
          rows={placesToTry}
        />
      )}

      <p className="text-sm text-muted-foreground">
        A restaurant gets a rank for this dish once at least {thresholds.minRaters} different people
        have rated it there; recent votes and trusted raters count more.
        {mode === "bootstrap" &&
          ` While ${ranking.city.name} is new, fewer votes are needed: these are early rankings.`}{" "}
        <Link
          href="/how-rankings-work"
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          How rankings work
        </Link>
      </p>

      <ShareButton title={titleOf(ranking)} text={shareText} path={pathOf(ranking)} />
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
