// The ranking page /[city]/best-[dish] (docs/01, docs/04): Next.js has no partial segments, so this
// [slug] segment answers only slugs with the "best-" prefix. ISR, one cached page per city × dish:
// it never reads searchParams; the filter bar works on the rows in the browser.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/components/layout/JsonLd";
import { RankingBrowser } from "@/components/ranking/RankingBrowser";
import { ShareButton } from "@/components/ranking/ShareButton";
import { formatNeeded, formatScore, formatVotes } from "@/lib/format";
import { SLUG_PATTERN } from "@/lib/slug";
import { rankingJsonLd } from "@/server/seo";
import { getRanking, type Ranking } from "@/server/services/ranking.service";
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
  return getRanking({ citySlug, dishSlug });
});

const pathOf = (r: Ranking) => `/${r.city.slug}/best-${r.dish.slug}`;
const titleOf = (r: Ranking) => `Best ${r.dish.name} in ${r.city.name}`;

function summaryOf(r: Ranking) {
  const votes = r.eligible.reduce((sum, row) => sum + row.votes, 0);
  const waiting = r.insufficient.length;
  if (r.eligible.length === 0) {
    return waiting > 0
      ? `${waiting} restaurant${waiting === 1 ? " is" : "s are"} collecting votes. None has enough yet.`
      : `No restaurant has votes for ${r.dish.name} in ${r.city.name} yet.`;
  }
  const ranked = `${r.eligible.length} restaurant${r.eligible.length === 1 ? "" : "s"} ranked from ${formatVotes(votes)}`;
  return waiting > 0 ? `${ranked}; ${waiting} more collecting votes.` : `${ranked}.`;
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
  if (!ranking) return { title: "Not found – DishRank", robots: { index: false } };
  const title = `${titleOf(ranking)} (${yearInPakistan()}) – DishRank`;
  const description =
    ranking.eligible.length > 0
      ? `${summaryOf(ranking)} Top: ${topThree(ranking)}. Ranked by dish from diners' ratings.`
      : `${summaryOf(ranking)} Rate ${ranking.dish.name} to help rank the restaurants.`;
  return {
    title,
    description,
    alternates: { canonical: pathOf(ranking) },
    openGraph: { title, description, url: pathOf(ranking), type: "website", siteName: "DishRank" },
    twitter: { card: "summary_large_image", title, description },
    // A page that ranks nobody yet stays out of search results (it is still linked and crawled).
    ...(ranking.eligible.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function RankingPage({ params }: PageProps<"/[city]/[slug]">) {
  const { city, slug } = await params;
  const ranking = await load(city, slug);
  if (!ranking) notFound();
  const { eligible, insufficient, thresholds, mode } = ranking;
  const shareText =
    eligible.length > 0
      ? `${titleOf(ranking)}, ranked by diners on DishRank: ${topThree(ranking)}`
      : `${titleOf(ranking)}: help rank them on DishRank`;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href={`/${ranking.city.slug}`}
          className="inline-flex min-h-11 items-center underline"
        >
          {ranking.city.name}
        </Link>
      </nav>
      <header className="flex flex-col gap-2">
        {mode === "bootstrap" && (
          <span className="w-fit rounded-full border px-2.5 py-0.5 text-sm font-medium">
            Early rankings
          </span>
        )}
        <h1 className="text-2xl font-bold">{titleOf(ranking)}</h1>
        <p className="text-base">{summaryOf(ranking)}</p>
      </header>

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

      {insufficient.length > 0 && (
        <section aria-labelledby="not-enough" className="flex flex-col gap-2">
          <h2 id="not-enough" className="text-lg font-semibold">
            Not enough votes yet
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {insufficient.map((row) => (
              <li key={row.restaurantDishId} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/${ranking.city.slug}/r/${row.restaurant.slug}`}
                    className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline"
                  >
                    {row.restaurant.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {[
                      row.restaurant.area?.name,
                      row.votes > 0 ? formatVotes(row.votes) : "No votes yet",
                      formatNeeded(row.ratingsNeeded),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Link
                  href={`/rate?city=${ranking.city.slug}&r=${row.restaurant.slug}&d=${ranking.dish.slug}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium underline"
                >
                  Rate
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        A restaurant gets a rank for this dish once at least {thresholds.minRaters} different people
        have rated it there; recent votes and trusted raters count more.
        {mode === "bootstrap" &&
          ` While ${ranking.city.name} is new, fewer votes are needed: these are early rankings.`}{" "}
        <Link href="/how-rankings-work" className="underline">
          How rankings work
        </Link>
      </p>

      <ShareButton title={titleOf(ranking)} text={shareText} path={pathOf(ranking)} />

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
    </main>
  );
}
