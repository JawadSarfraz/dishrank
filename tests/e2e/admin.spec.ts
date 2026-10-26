// CLAUDE.md rule 6 end to end: admin and owner pages send signed-out visitors to sign-in and show
// a signed-in diner (role USER) the Forbidden page, with no admin data.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E, type E2EFixture } from "./setup/constants";

const PAGES = ["/admin", "/admin/review", "/admin/users", "/admin/import", "/owner"];

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
