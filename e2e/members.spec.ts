import { expect, test } from "./fixtures";
import { openRiverside, signIn } from "./helpers";

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
