"use server";
// Rate-flow actions: auth → validate → service → revalidate (CLAUDE.md conventions). Rate limits
// live in the services, so the /api/v1 handlers get the same ones.
import { headers } from "next/headers";
import { requireUser } from "@/server/auth";
import { clientIp, ipHash } from "@/server/request-ip";
import { revalidateDishPages } from "@/server/revalidate";
import { recordLocationObservation } from "@/server/services/location.service";
import { propose } from "@/server/services/proposal.service";
import {
  addRestaurantDish,
  createOrReplace,
  deleteOwn,
  findMyRating,
} from "@/server/services/rating.service";
import { signPhotoUpload } from "@/server/services/upload.service";
import {
  locationObservationInput,
  parseInput,
  proposalInput,
  ratingInput,
  restaurantDishInput,
  uploadSignInput,
} from "@/server/validation";
import { id } from "@/server/validation/common";
import { z } from "zod";
import { runAction } from "./result";

export async function submitRatingAction(input: unknown) {
  return runAction("rating.submit", async () => {
    const actor = await requireUser();
    const result = await createOrReplace(actor, parseInput(ratingInput, input), {
      ipHash: ipHash(clientIp(await headers())),
    });
    revalidateDishPages({
      citySlug: result.restaurant.citySlug,
      dishSlug: result.dish.slug,
      restaurantSlug: result.restaurant.slug,
    });
    return result;
  });
}

export async function deleteRatingAction(ratingId: unknown) {
  return runAction("rating.delete", async () => {
    const actor = await requireUser();
    const deleted = await deleteOwn(actor, parseInput(id, ratingId));
    revalidateDishPages(deleted);
    return { id: deleted.id };
  });
}

export async function addRestaurantDishAction(input: unknown) {
  return runAction("restaurant_dish.add", async () => {
    const actor = await requireUser();
    return addRestaurantDish(actor, parseInput(restaurantDishInput, input));
  });
}

export async function proposeAction(input: unknown) {
  return runAction("proposal.create", async () => {
    const actor = await requireUser();
    return propose(actor, parseInput(proposalInput, input));
  });
}

export async function recordLocationAction(input: unknown) {
  return runAction("location.observe", async () => {
    const actor = await requireUser();
    return recordLocationObservation(actor, parseInput(locationObservationInput, input));
  });
}

/** A 10-minute upload URL for one dish photo (the browser has resized and re-encoded it). */
export async function signPhotoUploadAction(input: unknown) {
  return runAction("upload.sign", async () => {
    const actor = await requireUser();
    return signPhotoUpload(actor, parseInput(uploadSignInput, input));
  });
}

const myRatingInput = z.strictObject({ restaurantId: id, dishId: id });

/** The user's current rating of this dish here, to prefill the score step (read only). */
export async function myRatingAction(input: unknown) {
  return runAction("rating.mine", async () => {
    const actor = await requireUser();
    const { restaurantId, dishId } = parseInput(myRatingInput, input);
    return findMyRating(actor, restaurantId, dishId);
  });
}
