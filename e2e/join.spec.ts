import { expect, test, type Page } from "./fixtures";
import { rpc, signIn as apiSignIn } from "./legacy-client";
import { DEMO, signIn } from "./helpers";

// E-13b + D-158: join online with the test gateway and come back to the app's own address.
// Starting a checkout runs a server function that needs the backend's service-role secret, which
// only the deployed app has. So the checkout test runs against a deployed site (E2E_BASE_URL) or
// a local server started with SUPABASE_SERVICE_ROLE_KEY; otherwise it's skipped.
const canCheckout = !!process.env["E2E_BASE_URL"] || !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
const startedAt = new Date(Date.now() - 5_000).toISOString();

// Anything a test created in the demo orgs is removed afterwards (D-150).
test.afterAll(async () => {
  const admin = await apiSignIn(DEMO.national);
  await rpc(admin, "purge_smoke_data", { _since: startedAt });
});

async function openJoinPage(page: Page) {
  await signIn(page, "member");
  await page.goto("/join/demo-national");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Demo National Association" })).toBeVisible();
  // the payment button appears once a term is picked
  const term = page.getByRole("radio").first();
  if (await term.isVisible().catch(() => false)) await term.check();
  const canJoin = await page
    .getByRole("button", { name: /Continue to payment/ })
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!canJoin, "Demo Member can't join the national now (already a member, or closed)");
}

/** Pick a term and give every question in "About you" a simple answer. */
async function fillJoinForm(page: Page) {
  await page.getByRole("radio").first().check();
  const about = page.getByRole("group", { name: "About you" });
  if (!(await about.count())) return;
  for (const box of await about.getByRole("combobox").all()) {
    await box.click();
    await page.getByRole("option").first().click();
  }
  for (const input of await about.locator("input[type=text], input:not([type])").all())
    if (!(await input.inputValue())) await input.fill("E2E");
  for (const input of await about.locator("input[type=date]").all())
    if (!(await input.inputValue())) await input.fill("2024-01-01");
}

test("the join page asks every required question before payment (Rank, 0027)", async ({ page }) => {
  await openJoinPage(page);
  await page.getByRole("radio").first().check();
  const about = page.getByRole("group", { name: "About you" });
  await expect(about.getByText("Rank *")).toBeVisible();
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page.locator("li[data-sonner-toast]")).toContainText("Rank is required");
  await expect(page).toHaveURL(/\/join\/demo-national$/);
});

test("join the national, pay on the test checkout and return to the app", async ({ page }) => {
  test.skip(!canCheckout, "needs E2E_BASE_URL or SUPABASE_SERVICE_ROLE_KEY (see docs/testing.md)");
  await openJoinPage(page);
  await fillJoinForm(page);
  await page.getByRole("button", { name: /Continue to payment/ }).click();

  // the test checkout opens on the app's own address (never "localhost", D-158)
  await expect(page).toHaveURL(/\/pay\/test\//, { timeout: 30_000 });
  expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host);
  await page.getByRole("button", { name: /Card accepted/ }).click();

  await expect(page).toHaveURL(/\/join\/demo-national\/done/);
  await expect(
    page.getByRole("heading", { name: /Application received|Welcome to Demo National/ }),
  ).toBeVisible({ timeout: 30_000 });
});
