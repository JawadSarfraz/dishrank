// POST /api/v1/reports (docs/06): "Report a problem" with a restaurant; becomes a FLAG review item.
import { requireUser } from "@/server/auth";
import { jsonData, jsonError, readJson } from "@/server/http";
import { reportProblem } from "@/server/services/report.service";
import { parseInput, reportInput } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const result = await reportProblem(actor, parseInput(reportInput, await readJson(request)));
    return jsonData(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
