// docs/05 step 5: last-resort dish choice by Claude, menu uploads only. Uses structured outputs
// (output_config.format): current Claude models reject forced tool_choice, which docs/05's
// "tool-use with schema" relied on. Skipped entirely without ANTHROPIC_API_KEY and
// ANTHROPIC_MATCH_MODEL, so tests and keyless environments never touch the network.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export type LlmCandidate = { slug: string; name: string };
export type LlmVerdict = { dishSlug: string | null; confidence: number; reason: string };
export type LlmInput = { text: string; section?: string; candidates: LlmCandidate[] };
export type LlmMatcher = (input: LlmInput) => Promise<LlmVerdict | null>;

const VerdictSchema = z.object({
  dishSlug: z.string().nullable(),
  confidence: z.number(),
  reason: z.string(),
});

const SYSTEM = [
  "You match one item from a Pakistani restaurant menu to a canonical dish list.",
  "Answer with the slug of the single candidate that is the same dish, or null when none is.",
  "A different meat is a different dish (chicken karahi is not mutton karahi). Never invent a slug.",
  "confidence is your probability (0 to 1) that the chosen slug is right; use null with a low value when unsure.",
].join(" ");

function userPrompt({ text, section, candidates }: LlmInput): string {
  return [
    `Menu item (normalised): ${text}`,
    section ? `Menu section: ${section}` : "Menu section: unknown",
    "Candidates (slug: name):",
    ...candidates.map((c) => `- ${c.slug}: ${c.name}`),
  ].join("\n");
}

/** Returns null (step 5 is skipped) unless both the API key and the model id are configured. */
export function createLlmMatcher(config: { apiKey?: string; model?: string }): LlmMatcher | null {
  const { apiKey, model } = config;
  if (!apiKey || !model) return null;
  const client = new Anthropic({ apiKey });

  return async (input) => {
    if (input.candidates.length === 0) return null;
    try {
      const response = await client.messages.parse({
        model,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: userPrompt(input) }],
        output_config: { effort: "low", format: zodOutputFormat(VerdictSchema) },
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) return null;
      const { dishSlug, confidence, reason } = response.parsed_output;
      const known = dishSlug !== null && input.candidates.some((c) => c.slug === dishSlug);
      return {
        dishSlug: known ? dishSlug : null,
        confidence: Math.min(Math.max(confidence, 0), 1),
        reason,
      };
    } catch (error) {
      // Matching must never fail because the LLM is unavailable; the item goes to review instead.
      if (error instanceof Anthropic.APIError) {
        console.warn(
          `[matching] LLM step skipped: Anthropic API error ${error.status ?? "unknown"}`,
        );
      } else {
        console.warn(
          `[matching] LLM step skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }
  };
}
