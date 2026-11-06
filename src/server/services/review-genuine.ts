// In a burst of new accounts (docs/04 control 3), which ratings look like real diners. A post that
// works looks like a burst too, so the review queue pre-marks these and can release them in one tap.

export type RaterRating = { score: number; restaurantId: string };

/**
 * docs/07 §6: the account has rated at another restaurant and its scores vary. A hint for the
 * admin, never a decision: `ratings` are the account's ratings that an admin has not hidden.
 */
// DECISION-PENDING: "vary" is read as at least two different scores across the account's ratings.
export function looksGenuine(ratings: readonly RaterRating[], restaurantId: string): boolean {
  return (
    ratings.some((r) => r.restaurantId !== restaurantId) &&
    new Set(ratings.map((r) => r.score)).size > 1
  );
}
