// docs/08 Phase 4 acceptance: the ranking page shows the ranked list, "Not enough votes yet" and
// "Early rankings" (Islamabad is not launched), and a new rating shows on it without a redeploy.
// Fixtures: tests/e2e/setup/prepare.ts (Pizza: one ranked restaurant, one without votes).
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E, type E2EFixture } from "./setup/constants";

const fixture = (): E2EFixture => JSON.parse(readFileSync(E2E.fixtureFile, "utf8"));

test("ranking page: ranked list, not-enough-votes list, and a new vote shows up", async ({
  page,
  context,
  baseURL,
}) => {
  const { cookie, pizza } = fixture();
  await page.goto("/islamabad/best-pizza");
  await expect(
    page.getByRole("heading", { level: 1, name: "Best Pizza in Islamabad" }),
  ).toBeVisible();
  await expect(page.getByText("Early rankings", { exact: true })).toBeVisible();

  const ranked = page.getByRole("list", { name: "Ranked restaurants" });
  await expect(ranked.getByRole("listitem")).toHaveCount(1);
  await expect(ranked.getByLabel("Rank 1")).toBeVisible();
  await expect(ranked.getByRole("link", { name: pizza.ranked.name })).toBeVisible();
  await expect(ranked).toContainText("5 votes");
  await expect(ranked).toContainText("Rs 1,450");

  const waiting = page.getByRole("region", { name: "Not enough votes yet" });
  const corner = waiting.getByRole("listitem").filter({ hasText: pizza.unranked.name });
  await expect(corner).toContainText("No votes yet");

  // Structured data: an ItemList of Restaurants in rank order, never an aggregateRating.
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  );
  expect(jsonLd).toMatchObject({
    "@type": "ItemList",
    itemListElement: [{ position: 1, item: { "@type": "Restaurant", name: pizza.ranked.name } }],
  });
  expect(JSON.stringify(jsonLd)).not.toContain("aggregateRating");

  // The diner rates Pizza Corner from its row; the page shows the vote at the next visit.
  await context.addCookies([{ ...cookie, url: baseURL! }]);
  await corner.getByRole("link", { name: "Rate" }).tap();
  await page.getByRole("button", { name: "8 out of 10" }).tap();
  await page.getByRole("button", { name: "Submit rating" }).tap();
  await expect(page.getByRole("heading", { name: "Thanks for rating!" })).toBeVisible();
  await expect(async () => {
    await page.goto("/islamabad/best-pizza");
    await expect(
      page
        .getByRole("region", { name: "Not enough votes yet" })
        .getByRole("listitem")
        .filter({ hasText: pizza.unranked.name }),
    ).toContainText("1 vote", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
});

test("robots.txt keeps private pages out; the sitemap lists ranked pages only", async ({
  request,
}) => {
  const robots = await (await request.get("/robots.txt")).text();
  for (const path of ["/admin", "/owner", "/me", "/rate", "/api"]) {
    expect(robots).toContain(`Disallow: ${path}`);
  }
  expect(robots).toContain("/sitemap.xml");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/islamabad/best-pizza</loc>");
  expect(sitemap).toContain(`/islamabad/r/${fixture().pizza.ranked.slug}</loc>`);
  // Lists that rank nobody are noindex and left out.
  expect(sitemap).not.toContain("/islamabad/best-haleem</loc>");
});
