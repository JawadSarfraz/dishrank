"use server";
// "Report a problem" and /dispute: auth (a dispute needs none) → validate → service.
import { headers } from "next/headers";
import { getSessionUser, requireUser } from "@/server/auth";
import { clientIp, ipHash } from "@/server/request-ip";
import { fileDispute, reportProblem } from "@/server/services/report.service";
import { disputeInput, parseInput, reportInput } from "@/server/validation";
import { runAction } from "./result";

export async function reportProblemAction(input: unknown) {
  return runAction("report.create", async () => {
    const actor = await requireUser();
    return reportProblem(actor, parseInput(reportInput, input));
  });
}

export async function fileDisputeAction(input: unknown) {
  return runAction("dispute.create", async () => {
    const actor = await getSessionUser();
    return fileDispute(actor, parseInput(disputeInput, input), {
      ipHash: ipHash(clientIp(await headers())),
    });
  });
}
