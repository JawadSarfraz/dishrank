// Link previews (meta descriptions): WhatsApp shows about two lines, and a repeated sentence once
// slipped in (the summary already ended with the ranking rule and got it appended again).
import { describe, expect, it } from "vitest";
import {
  HOME_DESCRIPTION,
  cityDescription,
  dishDescription,
  restaurantDescription,
  sentencesOf,
} from "@/lib/descriptions";

const dish = [
  dishDescription({ top: null, contenders: 1, closesOn: "Sun 20 Dec" }),
  dishDescription({ top: null, contenders: 12, closesOn: "Sun 20 Dec" }),
  dishDescription({ top: null, contenders: 1, closesOn: null }),
  dishDescription({ top: null, contenders: 7, closesOn: null }),
  dishDescription({ top: null, contenders: 0, closesOn: "Sun 20 Dec" }),
  dishDescription({
    top: { name: "Butt Karahi Tikka", raters: 12 },
    contenders: 9,
    closesOn: null,
  }),
];

describe("page descriptions", () => {
  it("say the dish page's state in WhatsApp's two lines, with singular and plural right", () => {
    expect(dish).toEqual([
      "1 contender. Voting closes Sun 20 Dec. Rate the places you've tried.",
      "12 contenders. Voting closes Sun 20 Dec. Rate the places you've tried.",
      "1 contender. Voting is open. Rate the places you've tried.",
      "7 contenders. Voting is open. Rate the places you've tried.",
      "We're picking the contenders. Know a place that belongs here? Tell us.",
      "#1: Butt Karahi Tikka (12 raters). See the full ranking and add your vote.",
    ]);
    for (const d of dish) expect(d.length, d).toBeLessThanOrEqual(120);
  });

  it("never repeat a sentence, on any page", () => {
    const all = [
      ...dish,
      HOME_DESCRIPTION,
      cityDescription("Islamabad"),
      restaurantDescription({
        name: "Butt Karahi",
        place: "F-7, Islamabad",
        city: "Islamabad",
        best: { dish: "Chicken Karahi", rank: 1, score: "8.4", votes: "12 votes" },
      }),
      restaurantDescription({
        name: "Butt Karahi",
        place: "F-7, Islamabad",
        city: "Islamabad",
        best: null,
      }),
    ];
    for (const text of all) {
      const sentences = sentencesOf(text);
      expect(new Set(sentences).size, text).toBe(sentences.length);
    }
    // The check itself catches the bug it guards against.
    const old =
      "2 restaurants collecting votes · A place joins the ranking once at least 4 diners have rated it. A place joins the ranking once at least 4 diners have rated it. Rate the ones you've tried.";
    expect(new Set(sentencesOf(old)).size).toBeLessThan(sentencesOf(old).length);
  });
});
