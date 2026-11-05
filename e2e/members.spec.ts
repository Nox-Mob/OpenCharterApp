import { expect, test } from "./fixtures";
import { openOrg, signIn } from "./helpers";

// D-154: a national admin's Members page lists everyone below it, with organization and email.
test("the national's Members page lists every chapter's members", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "national", "members");
  await expect(page.getByRole("combobox", { name: "Whose members" })).toContainText("Everyone in");
  await expect(page.getByRole("columnheader", { name: "Organization" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Austin/ }).first()).toBeVisible();
});
