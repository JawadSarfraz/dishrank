// POST /api/v1/disputes (docs/06): the /dispute form; anyone may send one (limited per IP).
import { getSessionUser } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { clientIp, ipHash } from "@/server/request-ip";
import { fileDispute } from "@/server/services/report.service";
import { disputeInput, parseInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser();
    const result = await fileDispute(actor, parseInput(disputeInput, await readJson(request)), {
      ipHash: ipHash(clientIp(request.headers)),
    });
    return jsonData(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
