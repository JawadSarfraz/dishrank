// Score colours (docs/12-DESIGN.md): greens from 7.0 up, darker as the score rises, a calm slate
// for 6.0 to 6.9 and grey below 6. With few votes the Bayesian prior pulls early scores to about
// 6.5–8 (docs/04), so most of the site reads green or slate, never brown. Every band is white text
// on its colour at AA contrast or better (ratios in docs/12). Shared by server and client code.

export type ScoreBand = "top" | "high" | "good" | "mid" | "low";

export const SCORE_BANDS: { band: ScoreBand; min: number; label: string }[] = [
  { band: "top", min: 9, label: "Outstanding" },
  { band: "high", min: 8, label: "Excellent" },
  { band: "good", min: 7, label: "Good" },
  { band: "mid", min: 6, label: "Mixed" },
  { band: "low", min: 0, label: "Below average" },
];

export function scoreBand(score: number): ScoreBand {
  return SCORE_BANDS.find((b) => score >= b.min)?.band ?? "low";
}

/** Tailwind classes for a filled badge of this band (tokens --color-score-*). */
export const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  top: "bg-score-top text-white",
  high: "bg-score-high text-white",
  good: "bg-score-good text-white",
  mid: "bg-score-mid text-white",
  low: "bg-score-low text-white",
};

/** Hex values of the same bands, for places without Tailwind (the share images). */
export const SCORE_BAND_HEX: Record<ScoreBand, string> = {
  top: "#14532D",
  high: "#166534",
  good: "#15803D",
  mid: "#475569",
  low: "#6B7280",
};
