// Score bands (docs/12-DESIGN.md). Since "Garma Garam" (2026-11) every score shows as the same
// small blush pill with ink text, because the rank and the rater count carry the weight and a score
// stays small; the bands keep their names and labels for words ("Excellent"). Shared by server and
// client code.

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

/** Tailwind classes of a score pill (the same for every band: blush, ink text). */
export const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  top: "bg-blush text-ink",
  high: "bg-blush text-ink",
  good: "bg-blush text-ink",
  mid: "bg-blush text-ink",
  low: "bg-blush text-ink",
};

/** Hex values of the same bands, for places without Tailwind (the share images). */
export const SCORE_BAND_HEX: Record<ScoreBand, string> = {
  top: "#14532D",
  high: "#166534",
  good: "#15803D",
  mid: "#475569",
  low: "#6B7280",
};
