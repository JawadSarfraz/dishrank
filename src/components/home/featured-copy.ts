// The featured vote's words, built from the dish (spec §4, Featured vote card). The design's lines
// "Aap ki karahi ka number kya hai?" and "Vote for your karahi" were drawn for karahi only: the
// button names the dish itself, and the Roman-Urdu line is shown only for the dishes whose plain
// Urdu word is feminine ("aap ki …"), so it never reads wrong for a pizza or a burger.

const FEMININE: [RegExp, string][] = [
  [/karahi/, "karahi"],
  [/biryani/, "biryani"],
  [/nihari/, "nihari"],
  [/^chai$/, "chai"],
];

/** "Aap ki karahi ka number kya hai?", or null when the line does not fit the dish. */
export function romanUrduLine(slug: string): string | null {
  const word = FEMININE.find(([re]) => re.test(slug))?.[1];
  return word ? `Aap ki ${word} ka number kya hai?` : null;
}

/** "Vote for your chicken karahi". */
export const voteLabel = (dishName: string) => `Vote for your ${dishName.toLowerCase()}`;

/** "1 place", "14 places": never called with zero (spec §3). */
export const placesLabel = (n: number) => `${n} place${n === 1 ? "" : "s"}`;
