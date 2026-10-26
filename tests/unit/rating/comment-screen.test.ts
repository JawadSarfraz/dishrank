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
      // Separators and look-alike characters people use (security review, Phase 3).
      "Call 0300 - 1234567",
      "0300 – 1234567",
      "0300/1234567",
      "0300_1234567",
      "0300\u200B1234567",
      "０３００１２３４５６７",
      "WhatsApp 300 1234567",
      "0092 300 1234567",
      "UAN 111-222-333",
      "042-35678901",
      "+44 20 7946 0958",
      "00971 50 123 4567",
      "2 plates, call 0300 1234567",
      "0300 123 4567",
      "051-111-222-333",
      // Verification round: numbers the first redesign missed, and more separators.
      "92-51-2345678",
      "Tel 92 51 2345678",
      "0800-12345",
      "toll free 0800 78686",
      "0900-12345",
      "92512345678",
      "0300  -  1234567",
      "0300 ... 1234567",
      "0300,1234567",
      "0300|1234567",
      "0300:1234567",
      "0300*1234567",
      "0300\u034F1234567",
      "0300\u31641234567",
      "0300\u28001234567",
      "0300\uFE0F1234567",
    ]) {
      expect(screenComment(c), c).toBe("PHONE");
    }
  });

  it("holds links and email addresses", () => {
    expect(screenComment("see https://example.com/menu")).toBe("LINK");
    expect(screenComment("www.karahi-house.pk")).toBe("LINK");
    expect(screenComment("menu on butt-karahi.pk")).toBe("LINK");
    expect(screenComment("bit.ly/abc")).toBe("LINK");
    for (const c of [
      "is.gd/x",
      "rb.gy/x",
      "tiny.cc/x",
      "karahi.ai",
      "bit.\u200Bly/abc",
      "ｗｗｗ.example.com",
    ]) {
      expect(screenComment(c), c).toBe("LINK");
    }
    expect(screenComment("menu.example/abc")).toBe("LINK"); // any domain with a path
    for (const c of ["t.me/karahichannel", "youtu.be/abc", "Karahi.pk", "کڑاہی.pk پر آرڈر کریں"]) {
      expect(screenComment(c), c).toBe("LINK");
    }
    expect(screenComment("wa.me/923001234567")).toBe("PHONE"); // the number is found first
    expect(screenComment("mail owner@karahi.pk")).toBe("EMAIL");
  });

  it("lets ordinary comments through: prices, dates, scores and abbreviations", () => {
    for (const c of [
      "Rs 1,850 for half karahi, worth it",
      "Visited 2026-10-25, 10/10 ginger",
      "Best ginger in F-7. No.1 karahi e.g. Butt's",
      "2 people, 1200 each",
      // Dates, times, prices and scores do not start like a phone number.
      "Visited 25.10.2026 19:30, great ginger",
      "25/10/2026 dinner for 4, paid 3500",
      "2026-10-25 10/10",
      "Half 1200, full 2200, 1 kg 4400",
      "Spice 8/10, salt 6/10",
      "Table for 12 on 26-10-2026",
      // A missing space after a full stop is not a link.
      "Nice taste.Will come again",
      "Mr.Khan recommended it",
      "Best.Pizza in town",
      // Verification round: dates with times, price lists, word-like endings.
      "Visited 05/10/2026 19:30, great ginger",
      "Visited 30/10/2026 19:30",
      "31.12.2026 20:00",
      "Came at 7:15 pm on 05-10-2026",
      "Rs 350/450/550/650 for the four sizes",
      "Rs 3200 - 3500 - 3800",
      "Prices: 3500, 4500, 5500, 6500",
      "Taste was good.In short, worth it",
      "Ordered karahi.To be honest it was cold",
      "Average.Top dish is the tikka",
      "good.in short",
      "",
    ]) {
      expect(screenComment(c), c).toBeNull();
    }
    expect(screenComment(null)).toBeNull();
  });
});
