// The score a signed-out diner tapped, kept in the address (?score=8), so it survives the trip to
// Google and the move out of an in-app browser, where no other storage comes along. It only ever
// fills the form: the diner still taps once to submit (docs/01 D4).

const SCORE_PARAM = "score";

/** A whole score from 1 to 10 as the address holds it, or null. */
export function parsePendingScore(value: unknown): number | null {
  return typeof value === "string" && /^(?:[1-9]|10)$/.test(value) ? Number(value) : null;
}

/** "/rate?city=islamabad&r=…&d=…" with this score; an earlier one is replaced. */
export function withPendingScore(path: string, score: number): string {
  const [base = "", query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(SCORE_PARAM, String(score));
  return `${base}?${params}`;
}
