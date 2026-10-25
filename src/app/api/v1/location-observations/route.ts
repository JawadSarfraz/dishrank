// POST /api/v1/location-observations (docs/07 §7): a panel member's on-site location.
import { requireUser } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { recordLocationObservation } from "@/server/services/location.service";
import { locationObservationInput, parseInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const input = parseInput(locationObservationInput, await readJson(request));
    return jsonData(await recordLocationObservation(actor, input), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
