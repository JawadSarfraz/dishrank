// CLAUDE.md rule 6 end to end: admin and owner pages send signed-out visitors to sign-in and show
// a signed-in diner (role USER) the Forbidden page, with no admin data.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E, type E2EFixture } from "./setup/constants";

const PAGES = [
  "/admin",
  "/admin/review",
  "/admin/menus",
  "/admin/users",
  "/admin/import",
  "/admin/restaurants",
  "/admin/restaurants/new",
  "/admin/rankings",
  "/admin/analytics",
  "/owner",
];

test("admin and owner pages refuse visitors without the role", async ({
  page,
  context,
  baseURL,
}) => {
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?callbackUrl=`));
  }
  const { cookie }: E2EFixture = JSON.parse(readFileSync(E2E.fixtureFile, "utf8"));
  await context.addCookies([{ ...cookie, url: baseURL! }]);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Forbidden" })).toBeVisible();
    await expect(page.getByText("E2E Karahi House")).toHaveCount(0);
  }
});

// /sign-in while signed in: straight on to a same-site callbackUrl, else home; never another site.
test("a signed-in visitor on /sign-in goes on to the callbackUrl", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/sign-in?callbackUrl=%2Fme");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  const { cookie }: E2EFixture = JSON.parse(readFileSync(E2E.fixtureFile, "utf8"));
  await context.addCookies([{ ...cookie, url: baseURL! }]);
  await page.goto("/sign-in?callbackUrl=%2Fme");
  await expect(page).toHaveURL(`${baseURL}/me`);
  await page.goto("/sign-in?callbackUrl=https%3A%2F%2Fevil.example%2F");
  await expect(page).toHaveURL(`${baseURL}/`);
  await page.goto("/sign-in");
  await expect(page).toHaveURL(`${baseURL}/`);
});

// The account menu lives in the root layout: when it threw, every signed-in visitor who tapped it
// got Next's black "This page couldn't load" screen (2026-11-08). It must open, and go somewhere.
test("the account menu opens and goes to My ratings", async ({ page, context, baseURL }) => {
  const { cookie }: E2EFixture = JSON.parse(readFileSync(E2E.fixtureFile, "utf8"));
  await context.addCookies([{ ...cookie, url: baseURL! }]);
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.goto("/islamabad");
  await page.getByRole("button", { name: "Account menu" }).tap();
  await expect(page.getByRole("menuitem", { name: "My ratings" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("menuitem", { name: "My ratings" }).tap();
  await expect(page).toHaveURL(`${baseURL}/me`);
  await expect(page.getByRole("heading", { level: 1, name: "My ratings" })).toBeVisible();
  expect(crashes).toEqual([]);
});

// Phase 5 acceptance: an unmatched menu item is assigned in one tap, and the upload is done when
// every item is decided.
test("an admin assigns a menu item's suggested dish in one tap", async ({
  page,
  context,
  baseURL,
}) => {
  const { adminCookie, menuUploadId }: E2EFixture = JSON.parse(
    readFileSync(E2E.fixtureFile, "utf8"),
  );
  await context.addCookies([{ ...adminCookie, url: baseURL! }]);
  await page.goto("/admin/menus?status=PARSED");
  await page.getByRole("link", { name: new RegExp(E2E.menuRestaurant) }).tap();
  await expect(page).toHaveURL(new RegExp(`/admin/menus/${menuUploadId}$`));
  await expect(page.getByRole("heading", { name: "Needs review (2)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matched (1)" })).toBeVisible();

  await page.getByRole("button", { name: /^Chicken Karahi/ }).tap();
  await expect(page.getByRole("heading", { name: "Matched (2)" })).toBeVisible();
  await page.getByRole("button", { name: "Ignore" }).tap();
  await expect(page.getByRole("heading", { name: "Ignored (1)" })).toBeVisible();
  await expect(page.getByText("reviewed", { exact: true })).toBeVisible();
});
