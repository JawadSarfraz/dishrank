// The brand in one place (owner, Part 3; renamed from DishRank to Kahan Khayen on 2026-11-06): no
// page, image or manifest spells the name out. Internal names (the repo, the database, the package,
// env vars, cookie and cache prefixes) stay "dishrank" on purpose. The Urdu name is drawn as
// outlines (src/components/brand/urdu-name.ts), never with an Urdu web font. Colours here mirror
// the tokens in src/app/globals.css (docs/12-DESIGN.md).

export const BRAND = {
  name: "Kahan Khayen",
  /** کہاں کھائیں, "where should we eat?": the name in Urdu script, for alt texts and the docs. */
  urduName: "کہاں کھائیں",
  /** Under a home-screen icon (12 characters or fewer). */
  shortName: "Kahan Khayen",
  /** Roman Urdu: "the number one for every dish". */
  tagline: "Har dish ka pehla number",
  /** The English line that goes with the tagline. */
  taglineEnglish: "Restaurants ranked dish by dish, by people who ate there.",
  /** Roman Urdu: "Your opinion? Rate the 3 places you've tried." Then comes the link. */
  shareCall: "Aap ki rai? Jo 3 jagah try ki hain, unhein rate karein:",
  description:
    "The best restaurants for each dish in Islamabad and Rawalpindi, ranked by diners who ate there.",
  /** The browser chrome of the installed app and the manifest (= --brand). */
  themeColor: "#0E6B4A",
  /** The splash screen behind the icon (= --background). */
  backgroundColor: "#F7F8F6",
} as const;

/** "Rate a dish · Kahan Khayen", "Best Chicken Karahi in Islamabad – Kahan Khayen". */
export const pageTitle = (title: string, separator: "·" | "–" = "·") =>
  `${title} ${separator} ${BRAND.name}`;
