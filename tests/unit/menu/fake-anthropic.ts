// A stand-in for the Anthropic client's messages.create: records each request and answers with a
// canned message. No network.
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "@/server/vision";

export function fakeAnthropic(
  answer: unknown,
  over: { stop_reason?: Anthropic.StopReason; inputTokens?: number; outputTokens?: number } = {},
) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      async create(body) {
        calls.push(body);
        return {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: JSON.stringify(answer), citations: null }],
          stop_reason: over.stop_reason ?? "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: over.inputTokens ?? 2500,
            output_tokens: over.outputTokens ?? 400,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
        } as unknown as Anthropic.Message;
      },
    },
  };
  return { client, calls };
}
