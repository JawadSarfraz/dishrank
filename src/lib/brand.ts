// The brand in one place (owner, Part 3): the name may still change, so no page, image or manifest
// spells it out. Colours here mirror the tokens in src/app/globals.css (docs/12-DESIGN.md).

export const BRAND = {
  name: "DishRank",
  /** Under a home-screen icon (12 characters or fewer). */
  shortName: "DishRank",
  tagline: "Restaurants ranked dish by dish",
  description:
    "The best restaurants for each dish in Islamabad and Rawalpindi, ranked by diners who ate there.",
  /** The browser chrome of the installed app and the manifest (= --brand). */
  themeColor: "#0E6B4A",
  /** The splash screen behind the icon (= --background). */
  backgroundColor: "#F7F8F6",
} as const;

/** "Rate a dish · DishRank", "Best Chicken Karahi in Islamabad – DishRank". */
export const pageTitle = (title: string, separator: "·" | "–" = "·") =>
  `${title} ${separator} ${BRAND.name}`;
