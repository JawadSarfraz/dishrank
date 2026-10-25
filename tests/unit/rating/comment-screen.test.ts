import { describe, expect, it } from "vitest";
import { screenComment } from "@/server/services/comment-screen";

describe("comment screening (docs/04 abuse control 5)", () => {
  it("holds phone numbers in any common format, Urdu digits included", () => {
    for (const c of [
      "Call 0300 1234567",
      "order at 03001234567",
      "+92 300 1234567 for delivery",
      "051-2345678 landline",
      "(051) 234 5678",
      "۰۳۰۰۱۲۳۴۵۶۷",
    ]) {
      expect(screenComment(c), c).toBe("PHONE");
    }
  });

  it("holds links and email addresses", () => {
    expect(screenComment("see https://example.com/menu")).toBe("LINK");
    expect(screenComment("www.karahi-house.pk")).toBe("LINK");
    expect(screenComment("menu on butt-karahi.pk")).toBe("LINK");
    expect(screenComment("bit.ly/abc")).toBe("LINK");
    expect(screenComment("wa.me/923001234567")).toBe("PHONE"); // the number is found first
    expect(screenComment("mail owner@karahi.pk")).toBe("EMAIL");
  });

  it("lets ordinary comments through: prices, dates, scores and abbreviations", () => {
    for (const c of [
      "Rs 1,850 for half karahi, worth it",
      "Visited 2026-10-25, 10/10 ginger",
      "Best ginger in F-7. No.1 karahi e.g. Butt's",
      "2 people, 1200 each",
      "",
    ]) {
      expect(screenComment(c), c).toBeNull();
    }
    expect(screenComment(null)).toBeNull();
  });
});
