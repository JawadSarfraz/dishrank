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
