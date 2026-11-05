import { expect, guardedPage, test, type Page } from "./fixtures";
import { rpc, signIn as apiSignIn, type Db } from "../smoke/client";
import { DEMO, openOrganizations, orgMenu, signIn } from "./helpers";

// A throwaway demo national, built through the real screens and always deleted afterwards
// (delete_demo_organization). Covers: creating a national with the membership-model step
// (D-176), the chapter wizard (D-144), and the home-chapter model end to end (D-166, D-174).
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const NAME = `E2E National ${run}`;
const CHAPTER_A = `E2E Austin ${run}`;
const CHAPTER_B = `E2E Online ${run}`;
let nationalId = "";
let chapterA = "";
let chapterB = "";
let admin: Db;

/** Delete a demo national; warn instead of failing (deleting needs migration 0033 live). */
async function remove(id: string, name: string) {
  try {
    await rpc(admin, "delete_demo_organization", { _org: id, _confirm_name: name });
  } catch (e) {
    console.warn(`Couldn't delete demo organization "${name}" (${id}): ${(e as Error).message}`);
  }
}

test.beforeAll(async () => {
  admin = await apiSignIn(DEMO.national);
  // leftovers from earlier runs that couldn't be deleted
  const { data } = await admin
    .from("organizations")
    .select("id,name")
    .like("name", "E2E National %")
    .eq("is_demo", true)
    .is("parent_id", null);
  for (const o of data ?? []) await remove(o.id as string, o.name as string);
});

test.afterAll(async () => {
  if (nationalId) await remove(nationalId, NAME);
});

async function openSection(page: Page, orgId: string, section: string) {
  await page.goto(`/orgs/${orgId}?tab=${section}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("create a national and choose how membership works", async ({ page }) => {
  await signIn(page, "national");
  await openOrganizations(page);
  await page.getByRole("button", { name: "Create organization" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(NAME);
  await dialog.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: /national/i }).click();
  await dialog.getByRole("checkbox", { name: /This is a demo organization/ }).check();
  await dialog.getByRole("button", { name: "Next" }).click();

  // the comparison (D-176): both models, who each suits, and "decide later"
  await expect(dialog.getByText(/How membership works/)).toBeVisible();
  await expect(dialog.getByText("A good fit if:")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("li[data-sonner-toast]")).toContainText("Choose how membership works");
  await dialog.getByRole("radio", { name: "National membership with a home chapter" }).click();
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/orgs\/[0-9a-f-]{36}/);
  nationalId = page.url().match(/\/orgs\/([0-9a-f-]{36})/)![1]!;
  await openSection(page, nationalId, "settings");
  await expect(page.getByText("Chosen; can't be changed")).toBeVisible();
});

test("add a chapter with the wizard", async ({ page }) => {
  test.skip(!nationalId, "needs the national from the previous test");
  await signIn(page, "national");
  await openSection(page, nationalId, "chapters");
  await page.getByRole("button", { name: "Add chapter" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(CHAPTER_A);
  // step through the wizard (no chapter fields or required seats on a new national)
  for (let i = 0; i < 4 && !(await dialog.getByRole("button", { name: "Create" }).isVisible()); i++)
    await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog.getByText(/created|Open/i).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await openSection(page, nationalId, "chapters");
  await expect(page.getByRole("link", { name: new RegExp(CHAPTER_A) })).toBeVisible();
  const { data } = await admin.from("organizations").select("id").eq("name", CHAPTER_A).single();
  chapterA = data!.id as string;
});

test("a member picks a home chapter, changes it, and the chapter lists them", async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(!chapterA, "needs the chapter from the previous test");
  // Setup through the API: a level, a second chapter, Demo Member invited and given a membership.
  chapterB = await rpc<string>(admin, "create_organization", {
    _name: CHAPTER_B,
    _slug: `e2e-online-${run}`,
    _type: "chapter",
    _parent: nationalId,
  });
  const { data: tier } = await admin
    .from("membership_tiers")
    .insert({ org_id: nationalId, key: "regular", name: "Regular" })
    .select("id")
    .single();
  const { data: term } = await admin
    .from("tier_terms")
    .insert({
      tier_id: tier!.id,
      org_id: nationalId,
      key: "1y",
      label: "1 year",
      length_count: 1,
      length_unit: "year",
      price_minor: 2500,
    })
    .select("id")
    .single();
  const token = await rpc<string>(admin, "create_invitation", {
    _org: nationalId,
    _email: DEMO.member,
    _role_key: "member",
  });
  const member = await apiSignIn(DEMO.member);
  await rpc(member, "accept_invitation", { _token: token });
  const { data: profile } = await admin
    .from("org_member_profiles")
    .select("id")
    .eq("org_id", nationalId)
    .eq("email", DEMO.member)
    .single();
  await rpc(admin, "record_membership", {
    _profile: profile!.id,
    _term: term!.id,
    _method: "cash",
    _amount_minor: 2500,
  });

  // The member picks Austin, then moves to Online, on the national's Overview.
  await signIn(page, "member");
  await page.goto(`/orgs/${nationalId}`);
  const card = page.getByRole("region", { name: "Your chapter" });
  await expect(card).toContainText("member at large");
  await card.getByRole("combobox", { name: "Change chapter" }).click();
  await page.getByRole("option", { name: CHAPTER_A }).click();
  await card.getByRole("button", { name: "Change chapter" }).click();
  await expect(card).toContainText(`You belong to ${CHAPTER_A}`);
  await card.getByRole("combobox", { name: "Change chapter" }).click();
  await page.getByRole("option", { name: CHAPTER_B }).click();
  await card.getByRole("button", { name: "Change chapter" }).click();
  await expect(card).toContainText(`You belong to ${CHAPTER_B}`);

  // The national admin sees the member in Online (not Austin), with the national level.
  const adminPage = await guardedPage(browser, baseURL);
  await signIn(adminPage, "national");
  await openSection(adminPage, chapterB, "members");
  await expect(adminPage.getByRole("cell", { name: new RegExp(DEMO.member) })).toBeVisible();
  await expect(adminPage.getByRole("cell", { name: /Regular/ })).toBeVisible();
  await openSection(adminPage, chapterA, "members");
  await expect(adminPage.getByRole("cell", { name: new RegExp(DEMO.member) })).toHaveCount(0);
  await openSection(adminPage, nationalId, "members");
  await expect(adminPage.getByRole("columnheader", { name: "Chapter" })).toBeVisible();
  await expect(adminPage.getByRole("cell", { name: CHAPTER_B })).toBeVisible();
  await expect(
    orgMenu(adminPage).getByRole("button", { name: "Members", exact: true }),
  ).toBeVisible();
  await adminPage.context().close();
});
