"use server";
// Menu photo actions on the restaurant page (docs/07 §3): auth → validate → service. The rate
// limit lives in the service.
import { getSessionUser, requireUser } from "@/server/auth";
import { getMenuUploadAccess, submitMenuUpload } from "@/server/services/menu.service";
import { menuUploadInput, parseInput } from "@/server/validation";
import { id } from "@/server/validation/common";
import { runAction } from "./result";

/** Whether to show "Upload menu photo" to this user here (read only; the submit checks again). */
export async function menuUploadAccessAction(restaurantId: unknown) {
  return runAction("menu.access", async () =>
    getMenuUploadAccess(await getSessionUser(), parseInput(id, restaurantId)),
  );
}

/** The photo is in storage (signed upload) → MenuUpload PENDING. */
export async function submitMenuUploadAction(input: unknown) {
  return runAction("menu.upload", async () => {
    const actor = await requireUser();
    return submitMenuUpload(actor, parseInput(menuUploadInput, input));
  });
}
