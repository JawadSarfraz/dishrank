// The genuine-looking rule pre-marks ratings in a burst, and one tap releases them, so a wrong
// answer either buries real diners or waves a ring through.
import { describe, expect, it } from "vitest";
import { looksGenuine } from "@/server/services/review-genuine";

const HERE = "restaurant-here";
const THERE = "restaurant-there";

describe("looksGenuine", () => {
  it("wants a rating at another restaurant and scores that vary", () => {
    expect(
      looksGenuine(
        [
          { score: 9, restaurantId: HERE },
          { score: 6, restaurantId: THERE },
        ],
        HERE,
      ),
    ).toBe(true);
  });

  it("an account that only rated here does not look genuine, however its scores vary", () => {
    expect(
      looksGenuine(
        [
          { score: 9, restaurantId: HERE },
          { score: 4, restaurantId: HERE },
        ],
        HERE,
      ),
    ).toBe(false);
    expect(looksGenuine([{ score: 9, restaurantId: HERE }], HERE)).toBe(false);
  });

  it("the same score everywhere does not look genuine", () => {
    expect(
      looksGenuine(
        [
          { score: 10, restaurantId: HERE },
          { score: 10, restaurantId: THERE },
          { score: 10, restaurantId: "restaurant-third" },
        ],
        HERE,
      ),
    ).toBe(false);
  });

  it("an account with no rating left to read does not look genuine", () => {
    expect(looksGenuine([], HERE)).toBe(false);
  });
});
