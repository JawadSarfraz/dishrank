// Display formats shared by server and client components. Deterministic (no locale data), so the
// server's HTML and the browser's render always agree.

/** "8.3": scores have three decimals stored and one shown. */
export const formatScore = (score: number) => score.toFixed(1);

/** "1 vote", "23 votes" (votes = different people, docs/01 copy rules). */
export const formatVotes = (votes: number) => `${votes} vote${votes === 1 ? "" : "s"}`;

/** "Rs 1,850" (prices are whole rupees). */
export const formatPrice = (price: number) =>
  `Rs ${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** "from Rs 1,850": a dish row stores its lowest size's price (owner, Part 3), so public pages say so. */
export const formatFromPrice = (price: number) => `from ${formatPrice(price)}`;

/** "1.4 km". */
export const formatKm = (km: number) => `${km.toFixed(1)} km`;

/**
 * What a place still needs, in raters like the page's "4 raters needed". With enough raters only
 * the weight is short (new accounts count less, docs/04), which has no honest number.
 */
export function formatNeeded(votes: number, minRaters: number, ranksNext: boolean) {
  if (ranksNext) return "ranks at the next update";
  const raters = minRaters - votes;
  return raters > 0
    ? `needs ${raters} more rater${raters === 1 ? "" : "s"} to rank`
    : "needs a few more ratings to rank";
}

/** "Sun 20 Dec": a day in Pakistan, for the featured round's closing line (server pages only). */
export const formatPkDay = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Karachi",
  }).format(date);

/** "1 dish", "12 dishes". */
export const formatDishes = (n: number) => `${n} dish${n === 1 ? "" : "es"}`;

/** Overture's addresses can carry Arabic commas (،); we show ordinary ones. */
export const formatAddress = (address: string) => address.replace(/\s*،\s*/g, ", ");
