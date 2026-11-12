// Source tags (docs/01 D1b): a wrong tag would count a visit under the wrong channel, or let a long
// or odd value into the database; the first tag of a visit must win; an invite label beats a tag.
import { describe, expect, it } from "vitest";
import {
  newAccountSource,
  parseSourceTag,
  sourceCookie,
  sourceFromCookies,
  sourceFromSearch,
  visitSource,
  withShareTag,
} from "@/lib/source-tag";

describe("source tags", () => {
  it("accepts lowercase letters and digits up to 12, forgives case, refuses the rest", () => {
    expect(parseSourceTag("wa")).toBe("wa");
    expect(parseSourceTag(" IG ")).toBe("ig");
    expect(parseSourceTag("qr2026nov11")).toBe("qr2026nov11");
    expect(parseSourceTag("a".repeat(12))).toBe("a".repeat(12));
    for (const bad of [
      "a".repeat(13),
      "",
      "wa-group",
      "wa group",
      "wa/ig",
      "é",
      42,
      null,
      undefined,
    ]) {
      expect(parseSourceTag(bad), String(bad)).toBeNull();
    }
  });

  it("reads the tag from the address and from the cookie jar", () => {
    expect(sourceFromSearch("?s=wa&rate=1")).toBe("wa");
    expect(sourceFromSearch("?rate=1")).toBeNull();
    expect(sourceFromSearch("?s=not%20a%20tag")).toBeNull();
    expect(sourceFromCookies("dishrank_source=rd; other=1")).toBe("rd");
    expect(sourceFromCookies("other=1;  dishrank_source=li")).toBe("li");
    expect(sourceFromCookies("dishrank_source=%E9")).toBeNull(); // a malformed value never throws
    expect(sourceFromCookies("")).toBeNull();
    expect(sourceFromCookies("dishrank_sourced=wa")).toBeNull();
  });

  it("the first tag of the visit wins; a label beats a tag at sign-up", () => {
    expect(visitSource(null, "wa")).toBe("wa");
    expect(visitSource("wa", "share")).toBe("wa");
    expect(visitSource(null, null)).toBeNull();
    expect(newAccountSource("Food group", "wa")).toBe("Food group");
    expect(newAccountSource(null, "wa")).toBe("wa");
    expect(newAccountSource(null, null)).toBeNull();
  });

  it("keeps the tag only, for 7 days, Secure on https, and tags shared links", () => {
    expect(sourceCookie("wa", true)).toBe(
      "dishrank_source=wa; Path=/; Max-Age=604800; SameSite=Lax; Secure",
    );
    expect(sourceCookie("wa", false)).not.toContain("Secure");
    expect(
      withShareTag(new URL("https://kahankhayen.com/islamabad/best-chicken-karahi")).toString(),
    ).toBe("https://kahankhayen.com/islamabad/best-chicken-karahi?s=share");
  });
});
