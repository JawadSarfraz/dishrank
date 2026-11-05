// Original line icons for the dish tiles and chips (owner, Part 3: no stock photos, no copied art).
// One icon per dish family, picked from the dish slug; a plate when nothing fits.
import { cn } from "cn";

export type DishIconName =
  | "karahi"
  | "rice"
  | "platter"
  | "bowl"
  | "skewer"
  | "patty"
  | "puri"
  | "burger"
  | "pizza"
  | "drumstick"
  | "wrap"
  | "cup"
  | "plate";

const PATHS: Record<DishIconName, string> = {
  // A karahi from the side: the rim, the round body and the two ring handles.
  karahi:
    "M5.2 9.5h13.6M6 9.5c.4 4.6 3 7.2 6 7.2s5.6-2.6 6-7.2M4.6 9.5a1.7 1.7 0 1 0-1.7 1.7M19.4 9.5a1.7 1.7 0 1 1 1.7 1.7",
  // A bowl heaped with rice, grains above it.
  rice: "M3 12.5h18c0 4.6-4 7.5-9 7.5s-9-2.9-9-7.5zM6 12.5c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M9 7.5 8 5.5M15 7.5l1-2M12 6V4",
  // A round platter with a mound of mandi.
  platter: "M3 15.5c0 2.5 4 4.5 9 4.5s9-2 9-4.5M3 15.5h18M7 15.5c0-4 2.2-6.5 5-6.5s5 2.5 5 6.5",
  // A deep bowl with steam: nihari, haleem, curries.
  bowl: "M4 13h16c0 4-3.3 7-8 7s-8-3-8-7zM8.5 10c-1-1.4.9-2.3 0-3.8M12 10c-1-1.4.9-2.3 0-3.8M15.5 10c-1-1.4.9-2.3 0-3.8",
  // A skewer with three pieces: seekh, tikka, boti.
  skewer: "M4 20 20 4M8.2 12.3l3.5 3.5M11.2 9.3l3.5 3.5M14.2 6.3l3.5 3.5",
  // A flat chapli kabab.
  patty: "M3 13c0-2.8 4-5 9-5s9 2.2 9 5-4 5-9 5-9-2.2-9-5zM8 13h.01M12 12h.01M16 13h.01",
  // Halwa puri: a plate, a puri and a small bowl.
  puri: "M2.5 18c0 1.4 4.3 2.5 9.5 2.5s9.5-1.1 9.5-2.5M4.5 11.5a5 5 0 1 0 10 0 5 5 0 1 0-10 0zM15 13.5h6.5v1.5a3.2 3.2 0 0 1-6.5 0z",
  burger:
    "M4 10h16a8 8 0 0 0-16 0zM4 13.5h16M5 17h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 10h.01M12 9h.01M16 10h.01",
  // One slice.
  pizza: "M4 20 12 4l8 16zM4 20c2.5-1.3 5.3-2 8-2s5.5.7 8 2M11 10.5h.01M9.5 15.5h.01M14 15.5h.01",
  // Broast: a drumstick.
  drumstick:
    "M15.5 3.5a5 5 0 0 1 0 7.1l-5.4 5.4-2.6-2.6 5.4-5.4a5 5 0 0 1 2.6-4.5zM7.5 13.4 5 16a1.8 1.8 0 1 0 2 2l2.6-2.5",
  // A shawarma wrap.
  wrap: "M9 3h6l2 7-2 11H9L7 10zM7 10h10M9.5 6.5h5",
  // Chai.
  cup: "M5 9h11v6.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 6c-.8-1.2.7-1.8 0-3M12 6c-.8-1.2.7-1.8 0-3",
  plate: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z",
};

const BY_SLUG: Record<string, DishIconName> = {
  pizza: "pizza",
  broast: "drumstick",
  "halwa-puri": "puri",
  "anda-paratha": "puri",
  "chapli-kabab": "patty",
  "kabab-paratha-roll": "wrap",
};

const BY_WORD: [RegExp, DishIconName][] = [
  [/karahi|handi|gosht|dumpukht/, "karahi"],
  [/biryani|pulao|rice/, "rice"],
  [/mandi|sajji|chargha/, "platter"],
  [/nihari|haleem|paye|nalli|daal|chanay|qorma|kofta|jalfrezi/, "bowl"],
  [/kabab|tikka|boti|chops/, "skewer"],
  [/burger/, "burger"],
  [/shawarma|roll/, "wrap"],
  [/chai|lassi|coffee/, "cup"],
  [/paratha|puri/, "puri"],
  [/wings|nuggets|steak/, "drumstick"],
];

export function dishIconFor(slug: string): DishIconName {
  const direct = BY_SLUG[slug];
  if (direct) return direct;
  return BY_WORD.find(([re]) => re.test(slug))?.[1] ?? "plate";
}

export function DishIcon({
  slug,
  name,
  size = 24,
  className,
}: {
  slug?: string;
  /** Pick the icon directly instead of from a slug. */
  name?: DishIconName;
  size?: number;
  className?: string;
}) {
  const icon = name ?? dishIconFor(slug ?? "");
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <path d={PATHS[icon]} />
    </svg>
  );
}
