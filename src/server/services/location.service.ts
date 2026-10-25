// Panel members' on-site locations (docs/07 §7). A panel member rating at a restaurant may share the
// browser's location; it is kept as a LocationObservation (never on the rating) when the browser
// reports 50 m or better. A restaurant without a location, or with one far from the observation,
// gets one LOCATION_SUGGESTION review item; an admin who accepts it sets locationSource PANEL_GPS.
import { haversineKm } from "@/lib/geo";
import { AppError } from "@/server/errors";
import { logEvent } from "@/server/log";
import { RATE_LIMITS, assertRateLimit } from "@/server/rate-limit";
import {
  createReviewItem,
  findOpenReviewItem,
  insertLocationObservation,
  lockReviewItem,
  updateReviewItemPayload,
} from "@/server/repositories/moderation.repo";
import { findRestaurantById, lockRestaurants } from "@/server/repositories/restaurant.repo";
import { inTransaction } from "@/server/repositories/transaction";
import { findRater } from "@/server/repositories/user.repo";
import { assertRole, type SessionUser } from "@/server/roles";
import type { LocationObservationInput } from "@/server/validation";

export const LOCATION_RULES = {
  /** Browser accuracy radius kept, in metres. */
  maxAccuracyM: 50,
  /** An observation this far from the restaurant's location suggests moving it. */
  // DECISION-PENDING: 150 m (accuracy up to 50 m plus the size of a market block).
  farM: 150,
} as const;

export type SuggestionPayload = {
  restaurantId: string;
  observationIds: string[];
  /** The most accurate observation so far: what accepting the suggestion would save. */
  best: { observationId: string; lat: number; lng: number; accuracyM: number };
  current: { lat: number; lng: number; source: string | null } | null;
  /** Metres between the best observation and the current location; null without one. */
  distanceM: number | null;
};

export async function recordLocationObservation(
  actor: SessionUser | null,
  input: LocationObservationInput,
  now: Date = new Date(),
) {
  const user = assertRole(actor, ["USER", "OWNER", "ADMIN"]);
  const rater = await findRater(user.id);
  // The panel flag is read from the database, never from the client (docs/09 Prompt 4).
  if (!rater?.isPanel || rater.bannedAt) {
    throw new AppError("PANEL_ONLY", "Only panel members can share a restaurant's location", 403);
  }
  if (input.accuracyM > LOCATION_RULES.maxAccuracyM) {
    throw new AppError("LOCATION_TOO_COARSE", "Location not accurate enough (50 m or better)", 400);
  }
  const restaurant = await findRestaurantById(input.restaurantId);
  if (!restaurant || restaurant.status !== "ACTIVE") {
    throw new AppError("NOT_FOUND", "Restaurant not found", 404);
  }
  await assertRateLimit(`user:${rater.id}:location`, RATE_LIMITS.location, now);

  const result = await inTransaction(async (tx) => {
    // Lock order shared with merges and decisions: restaurant, then its review item. Under the
    // restaurant lock two observations cannot both open a suggestion, and the location compared
    // with is the current one.
    await lockRestaurants([restaurant.id], tx);
    const live = await findRestaurantById(restaurant.id, tx);
    if (!live || live.status !== "ACTIVE") {
      throw new AppError("NOT_FOUND", "Restaurant not found", 404);
    }
    const current =
      live.lat !== null && live.lng !== null
        ? { lat: live.lat, lng: live.lng, source: live.locationSource }
        : null;
    const distanceTo = (p: { lat: number; lng: number }) =>
      current ? Math.round(haversineKm(current, p) * 1000) : null;
    const distanceM = distanceTo(input);

    const observation = await insertLocationObservation(
      {
        restaurantId: live.id,
        userId: rater.id,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM,
        createdAt: now,
      },
      tx,
    );
    const needsSuggestion = distanceM === null || distanceM > LOCATION_RULES.farM;
    const found = await findOpenReviewItem("LOCATION_SUGGESTION", live.id, tx);
    const open = found ? await lockReviewItem(found.id, tx) : null;
    const stillOpen = open?.status === "OPEN" ? open : null;
    if (!needsSuggestion && !stillOpen) {
      return { observationId: observation.id, suggestion: "none" as const, distanceM };
    }

    const here = {
      observationId: observation.id,
      lat: input.lat,
      lng: input.lng,
      accuracyM: input.accuracyM,
    };
    if (stillOpen) {
      const payload = stillOpen.payload as SuggestionPayload;
      // Observations that agree with the current location still join an open suggestion.
      const best = here.accuracyM < payload.best.accuracyM ? here : payload.best;
      await updateReviewItemPayload(
        stillOpen.id,
        {
          ...payload,
          observationIds: [...payload.observationIds, observation.id],
          best,
          current,
          distanceM: distanceTo(best),
        },
        tx,
      );
      return { observationId: observation.id, suggestion: "updated" as const, distanceM };
    }
    const payload: SuggestionPayload = {
      restaurantId: live.id,
      observationIds: [observation.id],
      best: here,
      current,
      distanceM,
    };
    await createReviewItem(
      {
        type: "LOCATION_SUGGESTION",
        restaurantId: live.id,
        payload,
        createdByUserId: rater.id,
      },
      tx,
    );
    return { observationId: observation.id, suggestion: "created" as const, distanceM };
  });

  logEvent("location.observe", {
    userId: rater.id,
    entityId: restaurant.id,
    accuracyM: input.accuracyM,
    distanceM: result.distanceM,
    suggestion: result.suggestion,
  });
  return { ...result, accuracyM: input.accuracyM };
}
