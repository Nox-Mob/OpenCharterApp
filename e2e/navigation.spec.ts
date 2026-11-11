import { expect, test } from "./fixtures";
import { openRiverside, orgMenu, signIn } from "./helpers";

// The organization's menu in the left sidebar, and each section's page (D-152, D-188, D-205).
const SECTIONS: { tab: string; headings: string[] }[] = [
  { tab: "overview", headings: ["At a glance"] },
  { tab: "members", headings: ["Members"] },
  { tab: "board", headings: ["Board and officers"] },
  { tab: "reports", headings: ["Members", "Revenue"] },
  { tab: "settings", headings: ["General", "Tax profile"] },
  { tab: "levels", headings: ["How membership works here"] },
  { tab: "payments", headings: ["Payments received"] },
  { tab: "board-settings", headings: ["Board rules"] },
  { tab: "audit", headings: ["Audit log"] },
];

test("the owner's menu, with Settings' pages under Settings", async ({ page }) => {
  await signIn(page, "owner");
  await openRiverside(page);
  const menu = orgMenu(page);
  for (const item of ["Overview", "Members", "Board", "Reports", "Settings"])
    await expect(menu.getByRole("button", { name: item, exact: true })).toBeVisible();
  // Settings' pages appear only once Settings is open (D-188)
  await expect(menu.getByRole("list", { name: "Settings" })).toHaveCount(0);
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(menu.getByRole("list", { name: "Settings" })).toContainText("Audit log");
});

test("every section opens without an error", async ({ page }) => {
  await signIn(page, "owner");
  for (const { tab, headings } of SECTIONS) {
    await openRiverside(page, tab);
    for (const h of headings)
      await expect(
        page.getByRole("heading", { name: h, exact: true }).first(),
        `${tab}: ${h}`,
      ).toBeVisible();
    await expect(page.getByText(/something went wrong|couldn't load/i)).toHaveCount(0);
  }
});

test("the account page, and the organization switcher on Riverside", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await openRiverside(page);
  await expect(page.getByRole("button", { name: /Switch organization/ })).toContainText(
    "Riverside Community Association",
  );
});
