// What a dish page's share images draw (redesign spec §7), and the version in their URLs. The
// version is a hash of those facts, so the URL changes exactly when the picture does: a new rating,
// a released or hidden one, a nightly re-rank. WhatsApp and Facebook keep an image by its URL, so
// without it they would go on showing the first ranking they saw. Two pictures share the facts: the
// link preview (1200 × 630) and the WhatsApp status card (1080 × 1920).
import { createHash } from "node:crypto";
import type { getRankingPage } from "./ranking.service";

type RankingPage = NonNullable<Awaited<ReturnType<typeof getRankingPage>>>;

/**
 * The Roman-Urdu line under the podium or the seats: "Aap ki karahi ka number kya hai?" ("What's
 * your karahi's number?") names the dish only where we know its short name and its gender (ki for
 * a feminine noun, ke for a masculine one before "ka"); any other dish gets a neutral line.
 */
const DISH_LINES: [RegExp, string, "f" | "m"][] = [
  [/karahi/, "karahi", "f"],
  [/handi/, "handi", "f"],
  [/biryani/, "biryani", "f"],
  [/pulao/, "pulao", "m"],
  [/nihari/, "nihari", "f"],
  [/^haleem$/, "haleem", "m"],
  [/sajji/, "sajji", "f"],
  [/qorma/, "qorma", "m"],
  [/burger/, "burger", "m"],
  [/^pizza$/, "pizza", "m"],
  [/shawarma/, "shawarma", "m"],
  [/tikka/, "tikka", "m"],
  [/seekh-kabab/, "seekh kabab", "m"],
  [/^chapli-kabab$/, "chapli kabab", "m"],
  [/^chai$/, "chai", "f"],
  [/^lassi$/, "lassi", "f"],
];

export function dishLine(dishSlug: string): string {
  const hit = DISH_LINES.find(([re]) => re.test(dishSlug));
  if (!hit) return "Aap ke hisaab se number 1 kaun hai?";
  const [, noun, gender] = hit;
  return `Aap ${gender === "f" ? "ki" : "ke"} ${noun} ka number kya hai?`;
}

export function shareImageFacts(r: RankingPage) {
  const open = r.eligible.length === 0;
  const minRaters = r.thresholds.minRaters;
  // The most raters any one place has (null: no place on the list at all, so nobody has rated).
  const leading = r.firstRankRaters ?? 0;
  return {
    /** Nothing ranked: the picture asks the question and shows the "first raters" seats. */
    open,
    title: open
      ? `Where's the best ${r.dish.name.toLowerCase()} in ${r.city.name}?`
      : `Best ${r.dish.name} in ${r.city.name}`,
    /** The words drawn in brand red inside the question. */
    highlight: open ? r.dish.name.toLowerCase() : null,
    seats: open
      ? {
          total: minRaters,
          // Ticked seats: the leading place's raters, always leaving the visitor's "You?" seat.
          filled: Math.min(leading, minRaters - 1),
          /** "Pehla vote aap ka?" ("First vote yours?") is true only while nobody has rated. */
          call: leading === 0 ? "Pehla vote aap ka?" : "Agla vote aap ka?",
          note:
            leading === 0
              ? `A place joins the ranking once at least ${minRaters} diners have rated it.`
              : leading < minRaters
                ? `${leading} of ${minRaters} raters so far for the first ranked place.`
                : "A few more ratings for the first ranked place.",
        }
      : null,
    line: dishLine(r.dish.slug),
    /** A featured dish's closing line (the status card has room for it). */
    closingLine: r.featured?.closingLine ?? null,
    top: r.eligible.slice(0, 3).map((row) => ({
      rank: row.rank,
      name: row.restaurant.name,
      area: row.restaurant.area?.name ?? null,
      votes: row.votes,
    })),
  };
}

export type ShareImageFacts = ReturnType<typeof shareImageFacts>;

/** The images' URL version: `v` is ignored by the routes, it only makes a changed picture a new URL. */
function shareImageVersion(r: RankingPage) {
  return createHash("sha256")
    .update(JSON.stringify(shareImageFacts(r)))
    .digest("hex")
    .slice(0, 12);
}

/** The link-preview image (1200 × 630), versioned by what it draws so a changed list is re-fetched. */
export function shareImagePath(r: RankingPage) {
  return `/${r.city.slug}/best-${r.dish.slug}/share-image?v=${shareImageVersion(r)}`;
}

/** The WhatsApp status card (1080 × 1920): the same facts, the same version. */
export function statusImagePath(r: RankingPage) {
  return `/${r.city.slug}/best-${r.dish.slug}/share-image/status?v=${shareImageVersion(r)}`;
}
