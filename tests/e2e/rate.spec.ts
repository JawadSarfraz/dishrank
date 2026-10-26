// docs/08 Phase 3 acceptance: at 360 px, a signed-in diner rates a dish at an existing restaurant
// in 4 taps after the search, in under 30 seconds. The session is a real one in the test database
// (tests/e2e/setup/prepare.ts); its signed cookie is set here, as Google sign-in would set it.
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E, type E2EFixture } from "./setup/constants";

const fixture = (): E2EFixture => JSON.parse(readFileSync(E2E.fixtureFile, "utf8"));

/** Nothing on the page is wider than the 360 px screen. */
async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("rate a dish in 4 taps after search, in under 30 s, at 360 px", async ({
  page,
  context,
  baseURL,
}) => {
  const { cookie, restaurant, dish } = fixture();
  await context.addCookies([{ ...cookie, url: baseURL! }]);
  let taps = 0;
  const tap = async (target: Locator) => {
    await target.tap();
    taps += 1;
  };

  const started = Date.now();
  await page.goto("/rate");
  await page.getByRole("searchbox", { name: "Restaurant" }).fill("e2e karahi");
  const result = page.getByRole("button", { name: new RegExp(restaurant.name) });
  await expect(result).toBeVisible();
  await expectNoSideScroll(page);

  await tap(result);
  await expect(page.getByRole("heading", { name: "What did you eat?" })).toBeVisible();
  // Measured once the restaurant's own dishes are on screen (nothing moves after that).
  await expect(page.getByRole("heading", { name: "On the menu here" })).toBeVisible();
  const chip = page.getByRole("button", { name: new RegExp(`^${dish.name}`) }).first();
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoSideScroll(page);
  await tap(chip);

  const eight = page.getByRole("button", { name: "8 out of 10" });
  await expect(eight).toBeVisible();
  const box = (await eight.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expectNoSideScroll(page);
  await tap(eight);
  // Signed in: the button saves (signed out it would offer Google sign-in instead).
  await tap(page.getByRole("button", { name: "Submit rating" }));

  await expect(page.getByRole("heading", { name: "Thanks for rating!" })).toBeVisible();
  const elapsed = Date.now() - started;
  expect(taps).toBe(4);
  expect(elapsed).toBeLessThan(30_000);
  // One rater: the row is not eligible, so it shows what it needs and no rank.
  await expect(page.getByText(/needs \d+ more ratings? to rank/)).toBeVisible();
  await expect(page.getByText(/#\d+ in /)).toHaveCount(0);
  await expectNoSideScroll(page);

  // Saved for this diner: /me lists it.
  await page.getByRole("link", { name: "My ratings" }).tap();
  await expect(page.getByText(restaurant.name)).toBeVisible();
  await expect(page.getByText(dish.name).first()).toBeVisible();
  test.info().annotations.push({ type: "elapsed", description: `${elapsed} ms, ${taps} taps` });
});
