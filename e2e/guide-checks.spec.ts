import { expect, test } from "./fixtures";
import { rpc, signIn as apiSignIn, type Db } from "../smoke/client";
import { DEMO, openOrg, openOrganizations, orgMenu, signIn } from "./helpers";

/** Delete a throwaway demo national; warn instead of failing the test over cleanup. */
async function removeDemo(admin: Db, id: string, name: string) {
  try {
    await rpc(admin, "delete_demo_organization", { _org: id, _confirm_name: name });
  } catch (e) {
    console.warn(`Couldn't delete demo organization "${name}" (${id}): ${(e as Error).message}`);
  }
}

// Steps from docs/user-testing.md that a browser can check without changing anything (D-198).
// Each test names the guide section it covers.

test("§1.2 a wrong password, or an unknown email, gets the same neutral message", async ({
  page,
}) => {
  for (const email of [DEMO.chapter, `nobody-${Date.now()}@example.org`]) {
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    // nothing says whether the account exists
    await expect(page.getByText(/no account|not found|doesn.t exist|not registered/i)).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/\/auth/);
  }
});

test("§1.3 password reset answers the same whether or not the account exists", async ({ page }) => {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.org`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("If an account exists for that email, a reset link is on its way."),
  ).toBeVisible();
});

test("§1 signed-out visitors are sent to sign in, and come back afterwards", async ({ page }) => {
  await page.goto(`/orgs/${DEMO.orgs.austin}`);
  await expect(page).toHaveURL(/\/auth\?redirect=/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(DEMO.chapter);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${DEMO.orgs.austin}`));
});

test("§2b.3 only platform operators can create a demo organization", async ({ page }) => {
  await signIn(page, "chapter");
  await openOrganizations(page);
  await page.getByRole("button", { name: "Create organization" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name")).toBeVisible();
  await expect(dialog.getByText("This is a demo organization")).toHaveCount(0);
});

test("§2b.1 a platform operator is offered a demo organization", async ({ page }) => {
  await signIn(page, "national");
  await openOrganizations(page);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("dialog").getByText("This is a demo organization")).toBeVisible();
});

test("§2b.5 a demo chapter can't be deleted on its own", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "austin", "settings");
  await expect(page.getByRole("heading", { name: "Tax profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete this demo organization" })).toHaveCount(0);
  await openOrg(page, "national", "settings");
  await expect(page.getByRole("heading", { name: "Delete this demo organization" })).toBeVisible();
});

test("§3.2 the tax profile refuses a badly formed EIN", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "national", "settings");
  const ein = page.getByLabel("EIN");
  await expect(ein).toBeVisible();
  await ein.fill("123");
  await page.getByRole("button", { name: "Save tax profile" }).click();
  await expect(page.getByText("EIN must look like 12-3456789")).toBeVisible();
  // nothing was saved: the stored value comes back after a reload
  await page.reload();
  await expect(page.getByLabel("EIN")).not.toHaveValue("123");
});

test("§9.2 the member directory never shows email addresses", async ({ page }) => {
  await signIn(page, "member");
  await openOrg(page, "austin", "directory");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const main = page.locator("main");
  await expect(main.getByText(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i)).toHaveCount(0);
});

test("§14.0 members see the board but nothing to configure it", async ({ page }) => {
  await signIn(page, "member");
  await openOrg(page, "austin", "board");
  await expect(page.getByRole("heading", { name: "Board and officers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change board settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Appoint" })).toHaveCount(0);
  await expect(orgMenu(page).getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  // asking for the settings page directly falls back to the Overview
  await page.goto(`/orgs/${DEMO.orgs.austin}?tab=board-settings`);
  await expect(page.getByRole("button", { name: "Board settings" })).toHaveCount(0);
});

test("§6.2 a home-chapter national manages its own levels, even after opening Members", async ({
  page,
}) => {
  // A throwaway home-chapter demo national, made through the same functions as the app's
  // create dialog and deleted afterwards, so the test needs no data beyond the demo accounts.
  const admin = await apiSignIn(DEMO.national);
  const stale = await admin
    .from("units")
    .select("id,name")
    .like("name", "E2E Home %")
    .eq("is_demo", true)
    .is("parent_id", null);
  for (const o of stale.data ?? []) await removeDemo(admin, o.id as string, o.name as string);
  const name = `E2E Home ${Date.now().toString(36)}`;
  const id = await rpc<string>(admin, "create_demo_organization", {
    _name: name,
    _slug: name.toLowerCase().replace(/\s+/g, "-"),
    _type: "national",
  });
  try {
    const { error } = await admin
      .from("org_settings")
      .insert({ unit_id: id, key: "membership.model", value: "home_chapter", mode: "locked" });
    if (error) throw new Error(error.message);
    await signIn(page, "national");
    await page.goto(`/orgs/${id}?tab=members`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.waitForLoadState("networkidle");
    // through the menu, so what the Members page loaded is still cached
    await orgMenu(page).getByRole("button", { name: "Settings", exact: true }).click();
    await orgMenu(page).getByRole("button", { name: "Membership levels" }).click();
    await expect(page.getByRole("heading", { name: "How membership works here" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add level" })).toBeVisible();
    await expect(page.getByText(/doesn.t sell memberships of its own/)).toHaveCount(0);
  } finally {
    await removeDemo(admin, id, name);
  }
});
