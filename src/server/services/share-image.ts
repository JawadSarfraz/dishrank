// What a dish page's share image draws (docs/12-DESIGN.md), and the version in its URL. The version
// is a hash of those facts, so the URL changes exactly when the picture does: a new rating, a
// released or hidden one, a nightly re-rank. WhatsApp and Facebook keep an image by its URL, so
// without it they would go on showing the first ranking they saw.
import { createHash } from "node:crypto";
import { formatScore, formatVotes } from "@/lib/format";
import { scoreBand } from "@/lib/score-band";
import type { getRankingPage } from "./ranking.service";

type RankingPage = NonNullable<Awaited<ReturnType<typeof getRankingPage>>>;

export function shareImageFacts(r: RankingPage) {
  const votes = r.eligible.reduce((sum, row) => sum + row.votes, 0);
  const places = r.listedTotal;
  return {
    title: `Best ${r.dish.name} in ${r.city.name}`,
    /** Early rankings: the image leads with rank and votes, and the score is small. */
    early: r.mode === "bootstrap",
    summary:
      r.eligible.length > 0
        ? `${r.eligible.length} ranked from ${formatVotes(votes)} · ranked by diners`
        : `${places > 0 ? `${places} ${places === 1 ? "place" : "places"} to try` : "Not enough votes yet"}. Rate one you know.`,
    top: r.eligible.slice(0, 3).map((row) => ({
      rank: row.rank,
      name: row.restaurant.name,
      area: row.restaurant.area?.name ?? null,
      votes: row.votes,
      score: formatScore(row.score),
      band: scoreBand(row.score),
    })),
  };
}

/** The image's URL: `v` is ignored by the route, it only makes a changed picture a new URL. */
export function shareImagePath(r: RankingPage) {
  const version = createHash("sha256")
    .update(JSON.stringify(shareImageFacts(r)))
    .digest("hex")
    .slice(0, 12);
  return `/${r.city.slug}/best-${r.dish.slug}/share-image?v=${version}`;
}
