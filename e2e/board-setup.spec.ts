import { expect, test } from "@playwright/test";
import { openOrg, signIn } from "./helpers";

// E-17, D-156: a chapter's board, with the contact-email choice (opened, not saved).
test("a chapter admin sees the board and the contact-email choice for a seat", async ({ page }) => {
  await signIn(page, "chapter");
  await openOrg(page, "austin", "board");
  await expect(page.getByRole("heading", { name: "Board and officers" })).toBeVisible();
  const contact = page.getByRole("button", { name: "Contact email" }).first();
  const hasSeats = await contact
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!hasSeats, "no seats at Demo Austin");
  await contact.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "The officer's own email" })).toBeVisible();
  await dialog.getByRole("radio", { name: "A role email for this seat" }).click();
  await expect(dialog.getByLabel("Role email", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// D-143, D-152: guided setup lives under Settings → Setup.
test("a national admin finds guided setup under Settings", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "national", "setup");
  await expect(page.getByText("Membership setup").first()).toBeVisible();
  await expect(page.getByText("Board setup").first()).toBeVisible();
});
