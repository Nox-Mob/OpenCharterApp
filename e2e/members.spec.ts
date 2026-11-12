import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { DEMO, openRiverside, signIn } from "./helpers";

// The Members tab lists the demo roster like real, paying members: varied levels and lengths,
// standing, expiry and details.
test.beforeEach(async ({ page }) => {
  await signIn(page, "owner");
  await openRiverside(page, "members");
});

test("the roster lists every member with level, standing and expiry", async ({ page }) => {
  // every member shown, and more than 100 of them (the list loads after the page)
  await expect(page.getByText(/^Showing ([1-9]\d{2,}) of \1$/)).toBeVisible();
  const table = page.getByRole("table");
  for (const header of ["Name", "Standing", "Level", "Expires"])
    await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
  await expect(table.getByText(/Good standing/).first()).toBeVisible();
});

test("members are on different levels and lengths", async ({ page }) => {
  await page.getByRole("combobox").filter({ hasText: "Any level" }).click();
  for (const level of ["Household", "Individual", "Senior (65+)", "Student", "Business Sponsor"])
    await expect(page.getByRole("option", { name: level, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const table = page.getByRole("table");
  for (const length of [/· 1 year/, /· 2 years/, /· Monthly/, /· Lifetime/])
    await expect(table.getByText(length).first()).toBeVisible();
});

test("filtering by level and searching by name narrow the list", async ({ page }) => {
  await page.getByRole("combobox").filter({ hasText: "Any level" }).click();
  await page.getByRole("option", { name: "Business Sponsor", exact: true }).click();
  const showing = page.getByText(/^Showing \d+ of \d+$/);
  await expect(showing).not.toHaveText(/^Showing (\d+) of \1$/);
  await expect(
    page
      .getByRole("table")
      .getByText(/Business Sponsor/)
      .first(),
  ).toBeVisible();

  await page.getByRole("combobox").filter({ hasText: "Business Sponsor" }).click();
  await page.getByRole("option", { name: "Any level", exact: true }).click();
  await page.getByPlaceholder("Search name or email").fill("Jordan Lee");
  await expect(page.getByRole("table").getByText("Jordan Lee")).toBeVisible();
  await expect(showing).toHaveText(/^Showing 1 of \d+$/);
});

test("a member's details show their membership", async ({ page }) => {
  await page.getByPlaceholder("Search name or email").fill("Jordan Lee");
  await page
    .getByRole("row")
    .filter({ hasText: "Jordan Lee" })
    .getByRole("button", { name: "Details" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Jordan Lee");
  await expect(dialog).toContainText(/Household|Individual/);
});

// The shell's Help link (sidebar or header) opens the docs page for the screen (S-04).
const helpLink = (page: Page, path: string) =>
  page.locator(`a[href="https://docs.openapphub.org/${path}"]`).first();

test("the Help link follows the screen", async ({ page }) => {
  await expect(helpLink(page, "charter/members/roster/")).toBeAttached();
  await openRiverside(page, "levels");
  await expect(helpLink(page, "charter/membership/levels-and-dues/")).toBeAttached();
});

// S-05: answer the hub's billing call with an ended trial, so the app is read-only (nothing on
// staging changes; the database would refuse the writes anyway).
async function asReadOnly(page: Page) {
  await page.route("**/rest/v1/rpc/get_org_billing*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          plan_id: null,
          status: "trialing",
          apps: [],
          trial_ends_at: "2020-01-01T00:00:00Z",
          current_period_end: null,
          cancel_at_period_end: false,
        },
      ]),
    }),
  );
}

test("when the plan makes Charter read-only, writing is switched off", async ({ page }) => {
  await asReadOnly(page);
  await page.goto(`/orgs/${DEMO.org}/setup`);
  await expect(page.getByText(/Charter is read-only for this organization/)).toBeVisible();
  await openRiverside(page, "members");
  await expect(page.getByText(/this app is read-only/).first()).toBeVisible();
  // the roster is still there
  await expect(page.getByText(/^Showing ([1-9]\d{2,}) of \1$/)).toBeVisible();
});
