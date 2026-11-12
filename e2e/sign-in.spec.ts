import { expect, test } from "./fixtures";
import { DEMO, signIn } from "./helpers";

// The suite demo's two accounts, one password (docs/demo-data.md).
test("the demo account opens Riverside Community Association", async ({ page }) => {
  await signIn(page, "owner");
  await expect(page).toHaveURL(new RegExp(`/orgs/${DEMO.org}`));
  await expect(
    page.getByRole("heading", { level: 1, name: "Riverside Community Association" }),
  ).toBeVisible();
});

test("the test account has no organization and can't open Riverside", async ({ page }) => {
  await signIn(page, "empty");
  // Hosted: the welcome that sends you to OpenAppHub to create one; self-hosted: the empty list.
  await expect(
    page
      .getByRole("heading", { level: 1, name: "Set up your organization" })
      .or(page.getByText("You aren't part of any organization yet.")),
  ).toBeVisible();
  await page.goto(`/orgs/${DEMO.org}`);
  await expect(page.getByText("Organization not found or not visible to you.")).toBeVisible();
});

test("a wrong password is refused with a message", async ({ page }) => {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(DEMO.owner);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .or(page.getByText(/invalid|incorrect/i))
      .first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});
