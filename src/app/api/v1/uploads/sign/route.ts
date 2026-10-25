// POST /api/v1/uploads/sign (docs/06): a 10-minute signed URL for one dish photo.
import { requireUser } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { signPhotoUpload } from "@/server/services/upload.service";
import { parseInput, uploadSignInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    return jsonData(
      await signPhotoUpload(actor, parseInput(uploadSignInput, await readJson(request))),
    );
  } catch (error) {
    return jsonError(error);
  }
}
