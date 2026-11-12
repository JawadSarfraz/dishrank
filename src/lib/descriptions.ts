// The meta descriptions WhatsApp and search engines show under a link (2026-11-14). Short: WhatsApp
// shows about two lines (keep a dish page under about 120 characters), and no sentence twice (a
// summary that already ended with the ranking rule once got the rule appended again). Pure, so one
// test covers every page.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A dish ranking page, by its state. */
export function dishDescription(d: {
  /** The #1 place and its rater count, when something ranks. */
  top: { name: string; raters: number } | null;
  /** Places on the list (ranked, collecting votes, or not rated yet). */
  contenders: number;
  /** "Sun 20 Dec" while the dish is featured and voting for the round is open. */
  closesOn: string | null;
}): string {
  if (d.top) {
    return `#1: ${d.top.name} (${plural(d.top.raters, "rater")}). See the full ranking and add your vote.`;
  }
  if (d.contenders === 0) {
    return "We're picking the contenders. Know a place that belongs here? Tell us.";
  }
  const voting = d.closesOn ? `Voting closes ${d.closesOn}.` : "Voting is open.";
  return `${plural(d.contenders, "contender")}. ${voting} Rate the places you've tried.`;
}

export const HOME_DESCRIPTION =
  "Pick a dish and see restaurants ranked by diners' ratings of that dish: chicken karahi, biryani, nihari, burgers and more.";

export const cityDescription = (city: string) =>
  `Restaurants in ${city} ranked for each dish by diners' ratings: chicken karahi, biryani, nihari, burgers and more.`;

/** A restaurant page: its best-ranked dish, or what the page is. */
export function restaurantDescription(r: {
  name: string;
  place: string;
  city: string;
  best: { dish: string; rank: number; score: string; votes: string } | null;
}): string {
  return r.best
    ? `${r.name} in ${r.place}: ${r.best.dish} is #${r.best.rank} in ${r.city} (${r.best.score} · ${r.best.votes}). Dish-by-dish scores from diners.`
    : `${r.name} in ${r.place}: dish-by-dish scores from diners' ratings.`;
}

/** The sentences (and " · " parts) of a description, normalised, for the no-repeat check. */
export function sentencesOf(text: string): string[] {
  return (
    text
      // A full stop, question or exclamation mark, or the " · " that joins two parts of a line.
      .split(/(?<=[.!?])\s+|\s+·\s+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}
