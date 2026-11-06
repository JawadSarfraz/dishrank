// A score tapped before sign-in travels in the address: through Google's callback, through the
// refused-sign-in return and into the score step.
import { describe, expect, it } from "vitest";
import { parsePendingScore, withPendingScore } from "@/lib/pending-score";
import { safeCallbackPath, signedInRedirectPath } from "@/server/roles";

const step = "/rate?city=islamabad&r=butt-karahi-f-8&d=chicken-karahi";

describe("the score in the address", () => {
  it("takes whole scores from 1 to 10 and nothing else", () => {
    expect(parsePendingScore("1")).toBe(1);
    expect(parsePendingScore("10")).toBe(10);
    for (const bad of ["0", "11", "8.5", "-3", "08", "8a", "", undefined, null, 8, ["8"]]) {
      expect(parsePendingScore(bad)).toBeNull();
    }
  });

  it("keeps the step, and a new tap replaces the earlier score", () => {
    const eight = withPendingScore(step, 8);
    expect(eight).toBe(`${step}&score=8`);
    expect(withPendingScore(eight, 3)).toBe(`${step}&score=3`);
    expect(withPendingScore("/rate", 8)).toBe("/rate?score=8");
  });

  it("survives the sign-in callback, a refused sign-in and an account that is signed in already", () => {
    const back = withPendingScore(step, 8);
    expect(safeCallbackPath(back)).toBe(back);
    expect(signedInRedirectPath(back)).toBe(back);
    // A refused sign-in returns to /sign-in?callbackUrl=<this>, read back with the same rules.
    const error = new URL(`/sign-in?callbackUrl=${encodeURIComponent(back)}`, "https://x.test");
    expect(safeCallbackPath(error.searchParams.get("callbackUrl"))).toBe(back);
  });
});
