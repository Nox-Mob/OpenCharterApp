import { expect, test } from "./fixtures";
import { openOrg, orgMenu, signIn } from "./helpers";

// D-152, D-154, D-155: the left-hand menu by role, and "View as member".
test("a national admin gets the admin menu and can preview the member view", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "national");
  const menu = orgMenu(page);
  for (const item of ["Overview", "Members", "Board", "Reports", "Chapters", "Settings"])
    await expect(menu.getByRole("button", { name: item, exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Directory" })).toHaveCount(0);
  // Settings' pages appear only once Settings is open (D-188)
  await expect(menu.getByRole("list", { name: "Settings" })).toHaveCount(0);
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(menu.getByRole("list", { name: "Settings" })).toContainText("Audit log");
  await menu.getByRole("button", { name: "Overview", exact: true }).click();

  await page.getByRole("button", { name: "View as member" }).click();
  await expect(page.getByRole("status").filter({ hasText: "as a member would" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Directory" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/as=member/);
  await page.getByRole("button", { name: "Exit member view" }).click();
  await expect(menu.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
});

test("the member view shows Overview, Directory and Board, with the member's own cards", async ({
  page,
}) => {
  // Demo Member has their own record in Austin. If the account holds an admin role there
  // (docs/demo-data.md), use "View as member" to see what a plain member sees.
  await signIn(page, "member");
  await openOrg(page, "austin");
  const preview = page.getByRole("button", { name: "View as member" });
  if (await preview.isVisible()) await preview.click();
  const menu = orgMenu(page);
  await expect(menu.getByRole("button", { name: "Directory" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Members" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Board and who to contact" })).toBeVisible();
});

test("a chapter admin sees Reports for their own chapter only", async ({ page }) => {
  await signIn(page, "chapter");
  await openOrg(page, "austin", "reports");
  await expect(page.getByText(/^Demo Austin.*, as of today\./).first()).toBeVisible();
  await expect(page.getByText(/every organization below it/)).toHaveCount(0);
});

// D-205: the left sidebar holds Dashboard, the organization's menu, Account and Sign out.
test("the sidebar holds the menu, Account and Sign out", async ({ page }) => {
  await signIn(page, "national");
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await openOrg(page, "national");
  await expect(sidebar.getByRole("navigation", { name: "Organization" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Members", exact: true })).toBeVisible();
  await sidebar.getByRole("link", { name: "Account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await sidebar.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth/);
});
