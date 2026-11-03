// docs/07 §3: one menu photo → sections and items, read by the Anthropic Messages API (model from
// ANTHROPIC_VISION_MODEL). Structured output (output_config.format) with docs/07's schema: current
// Claude models reject the forced tool_choice that docs/07's `extract_menu` tool relied on (as in
// docs/05 step 5). The request holds nothing but the image and the prompt below: no restaurant,
// uploader or other data. The API key is never logged.
import Anthropic from "@anthropic-ai/sdk";

/** docs/07 §3, verbatim (the last-but-one sentence covers Urdu-script menus, owner 2026-11-04). */
export const MENU_SYSTEM_PROMPT =
  'You read a photo of a restaurant menu from Pakistan. Return every food/drink item exactly as printed, with its PKR price as an integer if visible. Keep section headings. Do not translate, do not guess items that are not visible, do not merge sizes (if Half and Full have prices, output two items "X Half" and "X Full"). Prices like 1,850/- are 1850. If an item name is not written in Latin letters (for example Urdu), keep it as printed in "name" and also give its Roman-Urdu spelling in lowercase in "roman" (for example "chicken karahi" for چکن کڑاہی); otherwise "roman" is null. Return nothing else.';

/**
 * docs/07 §3: `{ sections: [{ name, items: [{ name, price: integer|null, note: string|null,
 * roman: string|null }] }] }`.
 */
export const MENU_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: ["integer", "null"] },
                note: { type: ["string", "null"] },
                roman: { type: ["string", "null"] },
              },
              required: ["name", "price", "note", "roman"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["sections"],
  additionalProperties: false,
} as const;

export const MENU_VISION = {
  /** A long menu is a few thousand output tokens; well under the SDK's non-streaming limit. */
  maxTokens: 16_000,
  /** Per request: with one retry a read ends within 180 s of the routes' 300 s. */
  timeoutMs: 90_000,
  /** One retry on a connection error, 429 or 5xx; every attempt is an API call. */
  maxRetries: 1,
} as const;

export type MenuImage = { data: Uint8Array; mediaType: "image/jpeg" | "image/webp" };
export type TokenUsage = { inputTokens: number; outputTokens: number };
export type MenuVisionResult = { raw: unknown; usage: TokenUsage };

export type MenuVision = {
  readonly model: string;
  read(image: MenuImage): Promise<MenuVisionResult>;
};

/** The part of the Anthropic client this module calls; tests pass a fake one (no network). */
export type MessagesClient = {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
};

export type MenuVisionErrorCode = "MAX_TOKENS" | "REFUSAL" | "BAD_OUTPUT" | "API_ERROR";

/** A failed read; `usage` is what the API billed for it (zero when no answer came back). */
export class MenuVisionError extends Error {
  constructor(
    readonly code: MenuVisionErrorCode,
    message: string,
    readonly usage: TokenUsage = { inputTokens: 0, outputTokens: 0 },
  ) {
    super(message);
    this.name = "MenuVisionError";
  }
}

/** The request: the system prompt, the image first (as Anthropic recommends), and the schema. */
export function buildMenuRequest(
  model: string,
  image: MenuImage,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MENU_VISION.maxTokens,
    system: MENU_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: Buffer.from(image.data).toString("base64"),
            },
          },
        ],
      },
    ],
    // Copying printed text needs little reasoning; low effort keeps a parse cheap and quick.
    output_config: { effort: "low", format: { type: "json_schema", schema: MENU_SCHEMA } },
  };
}

function usageOf(message: Anthropic.Message): TokenUsage {
  const u = message.usage;
  return {
    inputTokens:
      u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens,
  };
}

/** The JSON answer of a finished response, or a MenuVisionError saying why there is none. */
export function readMenuResponse(message: Anthropic.Message): MenuVisionResult {
  const usage = usageOf(message);
  if (message.stop_reason === "max_tokens") {
    throw new MenuVisionError("MAX_TOKENS", "The menu was too long to read in one go", usage);
  }
  if (message.stop_reason === "refusal") {
    throw new MenuVisionError("REFUSAL", "The model declined to read this photo", usage);
  }
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new MenuVisionError("BAD_OUTPUT", "The model returned no menu", usage);
  try {
    return { raw: JSON.parse(text), usage };
  } catch {
    throw new MenuVisionError("BAD_OUTPUT", "The model's answer was not valid JSON", usage);
  }
}

/**
 * The menu reader, or null (parsing waits) unless both ANTHROPIC_API_KEY and
 * ANTHROPIC_VISION_MODEL are set. `client` replaces the Anthropic client in tests.
 */
export function createMenuVision(config: {
  apiKey?: string;
  model?: string;
  client?: MessagesClient;
}): MenuVision | null {
  const { apiKey, model } = config;
  if (!model || (!apiKey && !config.client)) return null;
  const client =
    config.client ??
    new Anthropic({ apiKey, maxRetries: MENU_VISION.maxRetries, timeout: MENU_VISION.timeoutMs });
  return {
    model,
    async read(image) {
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(buildMenuRequest(model, image));
      } catch (error) {
        // The status only: an SDK error can carry request details.
        const detail =
          error instanceof Anthropic.APIError
            ? error.status
              ? `Anthropic API error ${error.status}`
              : "Could not reach the Anthropic API (connection failed or timed out)"
            : error instanceof Error
              ? error.message
              : String(error);
        throw new MenuVisionError("API_ERROR", detail);
      }
      return readMenuResponse(message);
    },
  };
}
