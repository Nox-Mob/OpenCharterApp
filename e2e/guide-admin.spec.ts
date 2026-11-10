import { anonClient, rpc, signIn as apiSignIn, type Db } from "../smoke/client";
import { expect, guardedPage, test, type Page } from "./fixtures";
import { DEMO, signIn } from "./helpers";

// More steps from docs/user-testing.md (D-198, D-202), in a throwaway demo national with a chapter
// (separate memberships): approving applications, two-level dues, receipt footers and reissue,
// logos, roles and member/chapter fields. These steps still get a person's look in the guide;
// the tests say whether they work. The national is deleted at the end (its logo file too).
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const NAME = `E2E Admin ${run}`;
const SLUG = `e2e-admin-${run}`;
const CHAPTER = `E2E Admin Chapter ${run}`;
const CHAPTER_SLUG = `e2e-admin-ch-${run}`;
let admin: Db;
let member: Db;
let nationalId = "";
let chapterId = "";
let termId = "";

test.beforeAll(async () => {
  admin = await apiSignIn(DEMO.national);
  member = await apiSignIn(DEMO.member);
  // leftovers from an earlier run that was stopped before it could clean up
  const { data: old } = await admin
    .from("units")
    .select("id,name")
    .like("name", "E2E Admin %")
    .eq("is_demo", true)
    .is("parent_id", null);
  for (const o of old ?? [])
    await rpc(admin, "delete_demo_organization", { _org: o.id, _confirm_name: o.name }).catch(
      () => {},
    );

  nationalId = await rpc<string>(admin, "create_demo_organization", {
    _name: NAME,
    _slug: SLUG,
    _type: "national",
  });
  chapterId = await rpc<string>(admin, "create_organization", {
    _name: CHAPTER,
    _slug: CHAPTER_SLUG,
    _type: "chapter",
    _parent: nationalId,
  });
  // a level to join at, and test payments
  const { data: tier } = await admin
    .from("membership_tiers")
    .insert({ unit_id: nationalId, key: "regular", name: "Regular" })
    .select("id")
    .single();
  const { data: term } = await admin
    .from("tier_terms")
    .insert({
      tier_id: tier!.id,
      unit_id: nationalId,
      key: "1_year",
      label: "1 year",
      length_count: 1,
      length_unit: "year",
      price_minor: 5000,
    })
    .select("id")
    .single();
  termId = term!.id as string;
  await rpc(admin, "connect_test_gateway", { _org: nationalId });
});

test.afterAll(async () => {
  if (!nationalId) return;
  const { data: files } = await admin.storage.from("branding").list(nationalId);
  if (files?.length)
    await admin.storage.from("branding").remove(files.map((f) => `${nationalId}/${f.name}`));
  await rpc(admin, "delete_demo_organization", { _org: nationalId, _confirm_name: NAME }).catch(
    (e: Error) => console.warn(`Couldn't delete "${NAME}": ${e.message}`),
  );
});

async function open(page: Page, orgId: string, tab?: string) {
  await page.goto(`/orgs/${orgId}${tab ? `?tab=${tab}` : ""}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
/** A setting's row on Settings → General. */
const settingRow = (page: Page, label: string) =>
  page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
function answerNextDialog(page: Page, answer = "") {
  page.once("dialog", (d) => void d.accept(answer));
}

test("§11.4 an application waits for approval, and approving makes them a member", async ({
  page,
}) => {
  await signIn(page, "national");
  await open(page, nationalId, "settings");
  const approval = settingRow(page, "New members need admin approval");
  await approval.getByRole("switch", { name: "New members need admin approval" }).click();
  await approval.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("li[data-sonner-toast]").last()).toContainText("Saved");

  // Morgan joins and pays with the test checkout (the checkout screens are covered by the join spec)
  const payment = await rpc<string>(member, "begin_join", { _org: nationalId, _term: termId });
  expect(
    await rpc<string>(member, "complete_test_payment", { _payment: payment, _outcome: "accepted" }),
  ).toMatch(/pending/);

  await open(page, nationalId, "members");
  await expect(page.getByRole("heading", { name: "Applications (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("li[data-sonner-toast]").last()).toContainText("Application approved");
  await expect(page.getByRole("heading", { name: /Applications/ })).toHaveCount(0);
  const row = page.getByRole("row", { name: new RegExp(DEMO.member) });
  await expect(row).toContainText("Good standing");
});

test("§13.5 the receipt footer appears on receipts issued afterwards", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "settings");
  const footer = settingRow(page, "Receipt footer");
  await footer
    .getByRole("textbox", { name: "Receipt footer" })
    .fill(`Thank you for your support ${run}`);
  await footer.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("li[data-sonner-toast]").last()).toContainText("Saved");

  // a payment recorded by hand after the footer was set
  const { data: profile } = await admin
    .from("member_profiles")
    .select("id")
    .eq("unit_id", nationalId)
    .eq("email", DEMO.member)
    .single();
  await rpc(admin, "record_membership", {
    _profile: profile!.id,
    _term: termId,
    _amount_minor: 5000,
    _method: "check",
  });
  await open(page, nationalId, "payments");
  await page
    .getByRole("link", { name: /^\d{4}-\d{5}$/ })
    .first()
    .click();
  await expect(page.getByText(`Thank you for your support ${run}`)).toBeVisible();
});

test("§13.4 reissuing a receipt links the old one to the new one", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "payments");
  await page
    .getByRole("link", { name: /^\d{4}-\d{5}$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/receipts\//);
  const oldUrl = page.url();
  answerNextDialog(page, "Corrected the legal name");
  await page.getByRole("button", { name: "Reissue" }).click();
  // the new receipt opens
  await expect(page).not.toHaveURL(oldUrl);
  await expect(page).toHaveURL(/\/receipts\//);
  const newUrl = page.url();
  // the old one says it was replaced, and links to the new one
  await page.goto(oldUrl);
  await expect(page.getByText(/Replaced by/)).toBeVisible();
  await page.getByRole("link", { name: /^receipt \d{4}-\d{5}$/ }).click();
  await expect(page).toHaveURL(newUrl);
  // a replaced receipt can't be reissued or voided again
  await page.goto(oldUrl);
  await expect(page.getByRole("button", { name: "Reissue" })).toHaveCount(0);
});

test("§3.3 a logo uploaded at the national shows at its chapter", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "settings");
  // a 1×1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await page
    .getByLabel(/Upload a logo/)
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("li[data-sonner-toast]").last()).toContainText("Logo updated");
  await expect(page.getByRole("img", { name: `${NAME} logo` })).toBeVisible();
  await open(page, chapterId, "settings");
  await expect(page.getByRole("img", { name: `${CHAPTER} logo` })).toBeVisible();
  await expect(page.getByText(`Showing the logo from ${NAME}.`)).toBeVisible();
});

test("§4 a role defined at the national is offered at its chapter; the last admin stays", async ({
  page,
}) => {
  await signIn(page, "national");
  await open(page, nationalId, "roles");
  await page.getByRole("button", { name: "Add role" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(`Newsletter editor ${run}`);
  await dialog.getByRole("checkbox", { name: "See member profiles" }).check();
  await dialog.getByRole("button", { name: "Save role" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`Newsletter editor ${run}`)).toBeVisible();

  await open(page, chapterId, "roles");
  await expect(page.getByText(`Newsletter editor ${run}`)).toBeVisible();

  // the national's only admin has no "Remove" for their admin role
  await open(page, nationalId, "members");
  await expect(
    page.getByRole("button", { name: `Remove Organization admin from ${DEMO.national}` }),
  ).toHaveCount(0);
});

test("§5 member fields: a long choice list, an ordered list in the filters, a locked chapter field", async ({
  page,
}) => {
  await signIn(page, "national");
  await open(page, nationalId, "fields");
  // an ordered list with 21 choices: the dialog scrolls while Save stays reachable
  await page.getByRole("button", { name: "Add field" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Field name").fill("Grade");
  await dialog.getByRole("combobox", { name: "Field type" }).click();
  await page.getByRole("option", { name: /Ordered list/i }).click();
  for (let i = 1; i <= 21; i++) {
    if (i > 1 || (await dialog.getByLabel("Choice 1").count()) === 0)
      await dialog.getByRole("button", { name: "Add choice" }).click();
    await dialog.getByLabel(`Choice ${i}`).fill(`G-${i}`);
  }
  await expect(dialog.getByRole("button", { name: "Save field" })).toBeInViewport();
  await dialog.getByRole("button", { name: "Save field" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Grade", { exact: true })).toBeVisible();

  // the ordered list offers "at least" in the member filters
  await open(page, nationalId, "members");
  await page.getByRole("combobox", { name: "Member field" }).click();
  await page.getByRole("option", { name: "Grade" }).click();
  await expect(page.getByRole("combobox", { name: "Grade value" }).first()).toBeVisible();

  // a chapter field locked at the national is read-only at the chapter
  await open(page, nationalId, "chapter-fields");
  await page.getByRole("button", { name: "Add field" }).click();
  const chapterField = page.getByRole("dialog");
  await chapterField.getByLabel("Field name").fill("Charter number");
  await chapterField.getByRole("switch", { name: "Locked: only your admins can set it" }).click();
  await chapterField.getByRole("button", { name: "Save field" }).click();
  await expect(chapterField).toHaveCount(0);
  await expect(page.getByText("Locked").first()).toBeVisible();

  // at the chapter the field is marked as locked (the national's admins can still set it; a
  // chapter admin can't, which the database tests cover)
  await open(page, chapterId, "chapter-fields");
  await expect(page.getByText("Charter number")).toBeVisible();
  await expect(page.getByLabel("Locked").first()).toBeVisible();
});

test("§12b two-level dues: the chapter's join page asks for the national's dues first", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page, "national");
  await open(page, nationalId, "settings");
  const required = settingRow(page, "Chapter members also need a membership with you");
  await required.getByRole("switch").click();
  await required.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("li[data-sonner-toast]").last()).toContainText("Saved");

  // a chapter level to join at
  const { data: tier } = await admin
    .from("membership_tiers")
    .insert({ unit_id: chapterId, key: "local", name: "Local" })
    .select("id")
    .single();
  await admin.from("tier_terms").insert({
    tier_id: tier!.id,
    unit_id: chapterId,
    key: "1_year",
    label: "1 year",
    length_count: 1,
    length_unit: "year",
    price_minor: 2000,
  });
  await rpc(admin, "connect_test_gateway", { _org: chapterId }).catch(() => {});

  // Chris isn't a member of this national: joining the chapter starts with the national
  const visitor = await guardedPage(browser, baseURL);
  await signIn(visitor, "chapter");
  await visitor.goto(`/join/${CHAPTER_SLUG}`);
  await expect(visitor.getByText(/pay each organization.s dues separately/)).toBeVisible();
  await expect(visitor.getByText(`Step 1 of 2: ${NAME} dues`)).toBeVisible();
  await expect(visitor.getByRole("link", { name: `Join ${NAME} first` })).toBeVisible();
  await visitor.context().close();
  // the public join info says the same without signing in
  const info = await anonClient().rpc("public_join_info", { _slug: CHAPTER_SLUG });
  expect((info.data as { national_dues: { required: boolean } }).national_dues.required).toBe(true);
});
