// When to offer "Add Kahan Khayen to your home screen" (owner, Part 3): after the diner's second
// rating, or on their second visit (a second day with the site open); dismissed for 30 days with
// one tap; never once the app is installed. Everything lives in the browser's localStorage and
// is wrapped in try/catch: private windows and blocked storage simply never show the prompt.

const KEYS = {
  visits: "dishrank.pwa.visitDays",
  ratings: "dishrank.pwa.ratings",
  dismissedAt: "dishrank.pwa.dismissedAt",
  installed: "dishrank.pwa.installed",
} as const;

// Decided 2026-11-06: the thresholds below, as built (second rating or second visit, 30 days).
export const INSTALL_PROMPT = {
  /** Shown again this long after "Not now". */
  dismissForMs: 30 * 86_400_000,
  afterRatings: 2,
  afterVisits: 2,
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is blocked: the prompt is simply never offered.
  }
}

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

/** Counts today as a visit (once per day). Returns the number of distinct days seen. */
export function noteVisit(now: Date = new Date()): number {
  const days = new Set((read(KEYS.visits) ?? "").split(",").filter(Boolean));
  days.add(dayOf(now));
  const kept = [...days].slice(-INSTALL_PROMPT.afterVisits);
  write(KEYS.visits, kept.join(","));
  return kept.length;
}

/** Counts a saved rating. Returns the total so far. */
export function noteRating(): number {
  const n = Math.min(99, Number(read(KEYS.ratings) ?? 0) + 1);
  write(KEYS.ratings, String(n));
  return n;
}

export function dismissInstall(now: Date = new Date()) {
  write(KEYS.dismissedAt, String(now.getTime()));
}

export function markInstalled() {
  write(KEYS.installed, "1");
}

/** The site runs as an installed app (home-screen icon). */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** iPhone or iPad Safari: no install event; the diner adds it through the Share sheet. */
export function isIos(userAgent: string = navigator.userAgent): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
}

/** Whether the prompt may show now (visits and ratings counted, not dismissed lately, not installed). */
export function shouldOfferInstall(now: Date = new Date()): boolean {
  if (read(KEYS.installed) === "1" || isStandalone()) return false;
  const dismissedAt = Number(read(KEYS.dismissedAt) ?? 0);
  if (dismissedAt && now.getTime() - dismissedAt < INSTALL_PROMPT.dismissForMs) return false;
  const visits = (read(KEYS.visits) ?? "").split(",").filter(Boolean).length;
  const ratings = Number(read(KEYS.ratings) ?? 0);
  return ratings >= INSTALL_PROMPT.afterRatings || visits >= INSTALL_PROMPT.afterVisits;
}

/** Custom events the prompt listens to (dispatched on window). */
export const PWA_EVENTS = { installable: "dishrank:installable", rated: "dishrank:rated" } as const;
