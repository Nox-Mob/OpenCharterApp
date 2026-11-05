import { rpc, signIn as apiSignIn } from "../smoke/client";
import { expect, test } from "./fixtures";
import { DEMO, openOrg, orgMenu, signIn } from "./helpers";

// Sprint 4, "ready for real use" (docs/plans/wave-a-mvp.md §8). Read-only against the demo data,
// except the import, which removes what it adds.

test("privacy policy and terms are linked from sign-in and the app (U5)", async ({ page }) => {
  await page.goto("/auth");
  await page
    .getByRole("navigation", { name: "Legal" })
    .getByRole("link", { name: "Privacy policy" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Placeholder text");
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
  await page.goto("/auth");
  // wait for the app to hydrate before switching to "Create an account"
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByText(/By creating an account you agree to the/)).toBeVisible();
});

test("a member's account page shows their name, email and organizations (U4)", async ({ page }) => {
  await signIn(page, "member");
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByText(DEMO.member)).toBeVisible();
  await expect(page.getByLabel("Your name")).not.toHaveValue("");
  await expect(page.getByRole("link", { name: /Demo Austin/ })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
});

test("an admin's Overview offers the join page to share (U6)", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "national");
  const card = page.getByRole("region", { name: "Share your join page" });
  await expect(card.getByLabel("Join page address")).toHaveValue(/\/join\/[a-z0-9-]+$/);
  await expect(card.getByRole("button", { name: "Copy" })).toBeVisible();
});

test("the audit log says who did what, with previous and current values (U3)", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "national", "audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  // entries read "<time>, <who> <what>"; the demo national has history
  const first = page.locator("li time").first();
  await expect(first).toBeVisible();
  await expect(page.getByText(/(added|modified|removed|exported|applied)/).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Person" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Area" })).toBeVisible();
  // the Settings pages are listed while Settings is open (D-188)
  await expect(orgMenu(page).getByRole("list", { name: "Settings" })).toContainText("Audit log");
});

test("an admin imports members from a file, and takes one off the roster (U1, U2)", async ({
  page,
}) => {
  const admin = await apiSignIn(DEMO.chapter);
  const probe = await admin.rpc("restore_member_record", {
    _profile: "00000000-0000-0000-0000-000000000000",
  });
  test.skip(probe.error?.code === "PGRST202", "needs migration 0037");
  const startedAt = new Date().toISOString();
  const national = await apiSignIn(DEMO.national);
  const run = Date.now().toString(36);
  const email = `e2e-import-${run}@example.org`;
  await signIn(page, "chapter");
  await openOrg(page, "austin", "members");
  await page.getByRole("button", { name: "Import members" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Spreadsheet (CSV)")).toBeEnabled();
  await dialog.getByLabel("Spreadsheet (CSV)").setInputFiles({
    name: "members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Name,Email\nE2E Import ${run},${email}\n`),
  });
  await dialog.getByRole("button", { name: "Check the file" }).click();
  await expect(dialog.getByText(/Ready to import: 1 new/)).toBeVisible();
  await dialog.getByRole("button", { name: "Import 1 member" }).click();
  await expect(dialog.getByText(/Imported 1 member: 1 added/)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  try {
    await page.getByLabel("Search members").fill(email);
    await page
      .getByRole("row", { name: new RegExp(`E2E Import ${run}`) })
      .getByRole("button", { name: "Details" })
      .click();
    const details = page.getByRole("dialog");
    await details.getByRole("button", { name: "Remove from roster…" }).click();
    await details.getByLabel(/Reason/).fill("E2E test");
    await details.getByRole("button", { name: `Remove E2E Import ${run}` }).click();
    await expect(page.getByText(`E2E Import ${run} is off the roster`)).toBeVisible();
    await page.getByRole("button", { name: /removed from the roster/ }).click();
    await expect(page.getByText(`E2E Import ${run}`).first()).toBeVisible();
  } finally {
    // the demo data stays as it was
    await rpc(national, "purge_smoke_data", { _since: startedAt }).catch(() => {});
  }
});
