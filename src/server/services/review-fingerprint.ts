// The fingerprint of a review item as an admin saw it (docs/06 review-queue `fingerprint`).
import { createHash } from "node:crypto";

/**
 * What an admin sees of an item: its payload, its restaurant and the listed ratings' state (an edit
 * moves `updatedAt`, a decision changes `status`). A decision sent with an older fingerprint is
 * refused, so it never applies to ratings or a location the admin did not see.
 */
export function reviewFingerprint(
  item: { payload: unknown; restaurantId: string | null },
  ratings: readonly { id: string; status: string; updatedAt: Date }[],
  /** A location card also shows the restaurant's current location, which approving replaces. */
  location: { lat: number | null; lng: number | null; locationSource: string | null } | null = null,
): string {
  const state = [...ratings]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => [r.id, r.status, r.updatedAt.toISOString()]);
  const place = location ? [location.lat, location.lng, location.locationSource] : null;
  return createHash("sha256")
    .update(JSON.stringify([item.payload, item.restaurantId, state, place]))
    .digest("hex")
    .slice(0, 32);
}
