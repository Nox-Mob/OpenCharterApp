import { expect, test } from "./fixtures";
import { rpc, signIn as apiSignIn, type Db } from "./legacy-client";
import { DEMO, signIn } from "./helpers";

// A4 (D-165, D-177): a chapter links to a level its national suggests. Runs once migration 0032
// is live; uses a throwaway demo national (separate memberships) that is deleted afterwards.
const run = Date.now().toString(36);
const NAME = `E2E Levels ${run}`;
let admin: Db;
let nationalId = "";
let chapterId = "";

test.beforeAll(async () => {
  admin = await apiSignIn(DEMO.national);
});

test.afterAll(async () => {
  if (nationalId)
    await rpc(admin, "delete_demo_organization", { _org: nationalId, _confirm_name: NAME }).catch(
      (e: Error) => console.warn(`Couldn't delete "${NAME}": ${e.message}`),
    );
});

test("a chapter links to a suggested level, 20% less", async ({ page }) => {
  const probe = await admin.rpc("make_level_own", {
    _tier: "00000000-0000-0000-0000-000000000000",
  });
  test.skip(probe.error?.code === "PGRST202", "needs migration 0032 on the live database");

  nationalId = await rpc<string>(admin, "create_demo_organization", {
    _name: NAME,
    _slug: `e2e-levels-${run}`,
    _type: "national",
  });
  chapterId = await rpc<string>(admin, "create_organization", {
    _name: `E2E Levels Chapter ${run}`,
    _slug: `e2e-levels-ch-${run}`,
    _type: "chapter",
    _parent: nationalId,
  });
  const { data: tier } = await admin
    .from("membership_tiers")
    .insert({ unit_id: nationalId, key: "regular", name: "Regular", suggested: true })
    .select("id")
    .single();
  await admin.from("tier_terms").insert({
    tier_id: tier!.id,
    unit_id: nationalId,
    key: "1y",
    label: "1 year",
    length_count: 1,
    length_unit: "year",
    price_minor: 5000,
  });

  await signIn(page, "national");
  await page.goto(`/orgs/${chapterId}?tab=levels`);
  await expect(page.getByText("Suggested for you")).toBeVisible();
  await page.getByRole("button", { name: "Start from this level" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Later changes at the national don't affect it/)).toBeVisible();
  await dialog.getByRole("radio", { name: "Link to it" }).click();
  await dialog.getByRole("combobox", { name: "Your price" }).click();
  await page.getByRole("option", { name: "A percentage less" }).click();
  await dialog.getByLabel("Percent less").fill("20");
  await expect(dialog.getByRole("list", { name: "Your prices" })).toContainText("$40.00");
  await dialog.getByRole("button", { name: "Link this level" }).click();
  await expect(page.getByText(/Linked to .*Regular: 20% less than/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Make it our own" })).toBeVisible();
});
