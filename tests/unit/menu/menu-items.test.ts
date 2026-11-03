import { describe, expect, it } from "vitest";
import { createMenuVision, MENU_SYSTEM_PROMPT, parsePrice, toMenuItems } from "@/server/vision";
import { fakeAnthropic } from "./fake-anthropic";

describe("menu photo → items (docs/07 §3)", () => {
  it("reads printed prices: 1,850/- → 1850, never a guess", () => {
    expect(parsePrice(1850)).toBe(1850);
    expect(parsePrice("1,850/-")).toBe(1850);
    expect(parsePrice("Rs. 2,200")).toBe(2200);
    expect(parsePrice("PKR 950")).toBe(950);
    expect(parsePrice("1850.00")).toBe(1850);
    expect(parsePrice("۱۸۵۰")).toBe(1850); // Urdu digits
    expect(parsePrice("1100/2000")).toBeNull(); // two prices in one: not guessed
    expect(parsePrice("market price")).toBeNull();
    expect(parsePrice(0)).toBeNull();
    expect(parsePrice(-5)).toBeNull();
    expect(parsePrice(12.5)).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });

  it("keeps Half and Full as two items with their own prices, in menu order with sections", () => {
    const { items, dropped } = toMenuItems({
      sections: [
        {
          name: "  Karahi ",
          items: [
            { name: "Chicken Karahi Half", price: 1100, note: null },
            { name: "Chicken Karahi Full", price: "2,000/-", note: "serves 4" },
            { name: "   ", price: 50, note: null },
          ],
        },
        { name: "", items: [{ name: "Doodh  Pati", price: null, note: null }] },
        { name: "Broken", items: "not a list" },
      ],
    });
    expect(dropped).toBe(0);
    expect(items).toEqual([
      { rawName: "Chicken Karahi Half", rawPrice: 1100, rawSection: "Karahi" },
      { rawName: "Chicken Karahi Full", rawPrice: 2000, rawSection: "Karahi" },
      { rawName: "Doodh Pati", rawPrice: null, rawSection: null },
    ]);
    expect(toMenuItems("nonsense")).toEqual({ items: [], dropped: 0 });
  });

  it("sends Anthropic only the photo and the verbatim prompt, with the docs/07 schema, and counts tokens", async () => {
    const { client, calls } = fakeAnthropic(
      {
        sections: [
          { name: "Karahi", items: [{ name: "Chicken Karahi", price: 2000, note: null }] },
        ],
      },
      { inputTokens: 2600, outputTokens: 120 },
    );
    const vision = createMenuVision({ model: "test-vision-model", client })!;
    const result = await vision.read({ data: new Uint8Array([1, 2, 3]), mediaType: "image/webp" });
    expect(result.usage).toEqual({ inputTokens: 2600, outputTokens: 120 });
    expect(toMenuItems(result.raw).items).toHaveLength(1);

    expect(calls).toHaveLength(1);
    const body = calls[0]!;
    expect(Object.keys(body).sort()).toEqual(
      ["max_tokens", "messages", "model", "output_config", "system"].sort(),
    );
    expect(body.system).toBe(MENU_SYSTEM_PROMPT);
    expect(body.model).toBe("test-vision-model");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/webp", data: "AQID" },
          },
        ],
      },
    ]);
    expect(body.output_config?.format?.type).toBe("json_schema");
  });

  it("a cut-off or refused answer fails with the tokens it cost; no key or model means no reader", async () => {
    const cut = createMenuVision({
      model: "m",
      client: fakeAnthropic({}, { stop_reason: "max_tokens", outputTokens: 16000 }).client,
    })!;
    await expect(
      cut.read({ data: new Uint8Array([1]), mediaType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "MAX_TOKENS", usage: { outputTokens: 16000 } });
    const refused = createMenuVision({
      model: "m",
      client: fakeAnthropic({}, { stop_reason: "refusal" }).client,
    })!;
    await expect(
      refused.read({ data: new Uint8Array([1]), mediaType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "REFUSAL" });
    expect(createMenuVision({ apiKey: "k" })).toBeNull();
    expect(createMenuVision({ model: "m" })).toBeNull();
  });
});
