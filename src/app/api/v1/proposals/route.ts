// POST /api/v1/proposals (docs/06): a dish or restaurant suggestion becomes a review item only.
import { requireUser } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { propose } from "@/server/services/proposal.service";
import { parseInput, proposalInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const result = await propose(actor, parseInput(proposalInput, await readJson(request)));
    return jsonData(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
