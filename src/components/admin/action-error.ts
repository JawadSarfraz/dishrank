import type { ActionError } from "@/server/actions/result";

/** "Some fields are invalid: name: Too small; address: …" from a server action error. */
export function describeActionError(error: ActionError): string {
  const fields = (
    error.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined
  )?.fieldErrors;
  const list = Object.entries(fields ?? {})
    .filter(([, messages]) => messages?.length)
    .map(([field, messages]) => `${field}: ${messages!.join(", ")}`);
  return list.length > 0 ? `${error.message}: ${list.join("; ")}` : error.message;
}
