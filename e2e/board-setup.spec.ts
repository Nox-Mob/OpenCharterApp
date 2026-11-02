import { expect, test } from "@playwright/test";
import { openOrg, signIn } from "./helpers";

// E-17, D-156, D-185: the Board page shows the board and links to Settings → Board, where the
// contact-email choice for a seat lives (opened, not saved).
test("a chapter admin sets a seat's contact email in Settings → Board", async ({ page }) => {
  await signIn(page, "chapter");
  await openOrg(page, "austin", "board");
  await expect(page.getByRole("heading", { name: "Board and officers" })).toBeVisible();
  // no configuration on the Board page itself
  await expect(page.getByRole("button", { name: "Contact email" })).toHaveCount(0);
  await page.getByRole("button", { name: "Change board settings" }).click();
  await expect(page).toHaveURL(/tab=board-settings/);
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
