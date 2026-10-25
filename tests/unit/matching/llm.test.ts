import { describe, expect, it, vi } from "vitest";
import { matchDish } from "@/server/services/matching";
import { createLlmMatcher, type LlmMatcher } from "@/server/services/matching/llm";
import { memoryDeps } from "./helpers";

// No test here touches the network: the LLM is always a fake (vi.fn) or absent.
const verdict = (dishSlug: string | null, confidence: number): LlmMatcher =>
  vi.fn(async () => ({ dishSlug, confidence, reason: "fake" }));

describe("LLM step (docs/05 step 5)", () => {
  it("is skipped without an API key or a model (no client is created)", () => {
    expect(createLlmMatcher({})).toBeNull();
    expect(createLlmMatcher({ apiKey: "", model: "any-model" })).toBeNull();
    expect(createLlmMatcher({ apiKey: "key-not-used" })).toBeNull();
  });

  it("only runs for menu uploads (allowLlm)", async () => {
    const llm = verdict("chicken-karahi", 0.95);
    const r = await matchDish("Chikan Kadhai", {}, memoryDeps({ llm }));
    expect(llm).not.toHaveBeenCalled();
    expect(r.method).toBe("TRIGRAM");
  });

  it("never runs when the alias match is already 1.0", async () => {
    const llm = verdict("mutton-karahi", 0.99);
    const r = await matchDish("Chicken Karahi", { allowLlm: true }, memoryDeps({ llm }));
    expect(llm).not.toHaveBeenCalled();
    expect(r).toMatchObject({ dishSlug: "chicken-karahi", method: "ALIAS" });
  });

  it("accepts a pick at 0.85 or more, with the section hint and the candidates", async () => {
    // "chiken karahi white": no alias; trigram gives chicken-karahi 0.52, so the LLM gets one candidate.
    const llm = verdict("chicken-karahi", 0.92);
    const r = await matchDish(
      "Chiken Karahi White",
      { allowLlm: true, section: "Karahi" },
      memoryDeps({ llm }),
    );
    expect(r).toMatchObject({
      dishSlug: "chicken-karahi",
      method: "LLM",
      confidence: 0.92,
      decision: "auto",
    });
    expect(r.variantTags).toEqual(["white"]);
    expect(llm).toHaveBeenCalledWith(
      expect.objectContaining({
        section: "Karahi",
        candidates: expect.arrayContaining([{ slug: "chicken-karahi", name: "Chicken Karahi" }]),
      }),
    );
  });

  it("is not asked when no candidate reaches 0.45 (it may only choose among candidates)", async () => {
    const llm = verdict("chicken-karahi", 0.99);
    const r = await matchDish("Chikan Kadhai Special", { allowLlm: true }, memoryDeps({ llm }));
    expect(llm).not.toHaveBeenCalled();
    expect(r.decision).toBe("review-no-suggestion");
  });

  it("keeps the best suggestion when the LLM is unsure or picks nothing", async () => {
    for (const llm of [verdict("chicken-karahi", 0.6), verdict(null, 0.9)]) {
      const r = await matchDish("Chikan Kadhai", { allowLlm: true }, memoryDeps({ llm }));
      expect(r).toMatchObject({
        method: "TRIGRAM",
        decision: "review",
        dishSlug: "chicken-karahi",
      });
    }
  });

  it("ignores a slug that is not a known dish", async () => {
    const r = await matchDish(
      "Chikan Kadhai",
      { allowLlm: true },
      memoryDeps({ llm: verdict("no-such-dish", 0.99) }),
    );
    expect(r.method).toBe("TRIGRAM");
  });

  it("is capped at 0.50 by meat-word safety, so 'Karahi' never auto-matches a meat", async () => {
    const r = await matchDish(
      "Karahi (per kg)",
      { allowLlm: true },
      memoryDeps({ llm: verdict("chicken-karahi", 0.99) }),
    );
    expect(r).toMatchObject({
      method: "LLM",
      dishSlug: "chicken-karahi",
      confidence: 0.5,
      decision: "review",
    });
  });

  it("does not run when there are no candidates at all", async () => {
    const llm = verdict("chai", 0.99);
    const r = await matchDish("Raita", { allowLlm: true }, memoryDeps({ llm }));
    expect(llm).not.toHaveBeenCalled();
    expect(r.method).toBe("NONE");
  });
});
