import { rpc, signIn as apiSignIn, type Db } from "./legacy-client";
import { expect, guardedPage, test, type Page } from "./fixtures";
import { DEMO, signIn } from "./helpers";

// Steps from docs/user-testing.md that change things, run in a throwaway demo national with one
// chapter (D-198). The national is created through the API, exercised through the screens, and
// deleted through the screens at the end (or through the API if a step failed first), so the
// shared demo organizations are never touched.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const NAME = `E2E Guide ${run}`;
const CHAPTER = `E2E Guide Chapter ${run}`;
const MEMBER = `Pat Guide ${run}`;
let admin: Db;
let nationalId = "";
let chapterId = "";
let deleted = false;

/** YYYY-MM-DD in the browser's local time, as the app shows dates. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The last day of a term that starts on `from` and lasts `years` years. */
function termEnd(from: Date, years: number) {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() - 1);
  return d;
}

test.beforeAll(async () => {
  admin = await apiSignIn(DEMO.national);
  // leftovers from an earlier run that was stopped before it could delete its national
  const { data: old } = await admin
    .from("units")
    .select("id,name")
    .like("name", "E2E Guide %")
    .eq("is_demo", true)
    .is("parent_id", null);
  for (const o of old ?? [])
    await rpc(admin, "delete_demo_organization", { _org: o.id, _confirm_name: o.name }).catch(
      () => {},
    );
  nationalId = await rpc<string>(admin, "create_demo_organization", {
    _name: NAME,
    _slug: `e2e-guide-${run}`,
    _type: "national",
  });
  chapterId = await rpc<string>(admin, "create_organization", {
    _name: CHAPTER,
    _slug: `e2e-guide-ch-${run}`,
    _type: "chapter",
    _parent: nationalId,
  });
});

test.afterAll(async () => {
  if (nationalId && !deleted)
    await rpc(admin, "delete_demo_organization", { _org: nationalId, _confirm_name: NAME }).catch(
      (e: Error) => console.warn(`Couldn't delete "${NAME}": ${e.message}`),
    );
});

async function open(page: Page, orgId: string, tab?: string) {
  await page.goto(`/orgs/${orgId}${tab ? `?tab=${tab}` : ""}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Accept the next browser prompt or confirm, answering a prompt with `answer`. */
function answerNextDialog(page: Page, answer = "") {
  page.once("dialog", (d) => void d.accept(answer));
}

test("§6.2 add a membership level with its price in dollars", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "levels");
  await page.getByRole("button", { name: "Add level" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Level name").fill("Regular");
  await dialog.getByLabel("Term 1 price").fill("50");
  await dialog.getByRole("button", { name: "Save level" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/\$50\.00/).first()).toBeVisible();
});

test("§7.1–7.3 add a member, record a membership paid in cash, then a renewal", async ({
  page,
}) => {
  await signIn(page, "national");
  await open(page, nationalId, "members");
  await page.getByRole("button", { name: "Add member" }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Name").fill(MEMBER);
  await add.getByRole("button", { name: "Add member" }).click();

  const details = page.getByRole("dialog");
  await expect(details.getByRole("heading", { name: MEMBER })).toBeVisible();
  await expect(details.getByText("Contact (no login yet)")).toBeVisible();
  await expect(details.getByText("No membership recorded yet.")).toBeVisible();

  await details.getByRole("button", { name: "Record membership" }).click();
  const record = page.getByRole("dialog", { name: /Record a membership/ });
  await record.getByRole("combobox", { name: "Level and term" }).click();
  await page.getByRole("option", { name: /Regular/ }).click();
  await record.getByRole("button", { name: "Record membership" }).click();
  await expect(record).toHaveCount(0);

  const today = new Date();
  const through = termEnd(today, 1);
  await expect(details.getByText("Good standing")).toBeVisible();
  await expect(details.getByText(ymd(through)).first()).toBeVisible();
  await expect(details.getByText("Joined", { exact: true })).toBeVisible();

  // a renewal starts the day after the current paid-through date
  await details.getByRole("button", { name: "Record renewal" }).click();
  const renew = page.getByRole("dialog", { name: /Record a renewal/ });
  await renew.getByRole("combobox", { name: "Level and term" }).click();
  await page.getByRole("option", { name: /Regular/ }).click();
  await renew.getByRole("button", { name: "Record renewal" }).click();
  await expect(renew).toHaveCount(0);
  const next = new Date(through);
  next.setDate(next.getDate() + 1);
  await expect(details.getByText(ymd(termEnd(next, 1))).first()).toBeVisible();
  await expect(details.getByText("Renewed", { exact: true })).toBeVisible();
});

test("§8.1–8.3 search, the count, and a saved view that survives a reload", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "members");
  await page.getByLabel("Search members").fill(`guide ${run}`);
  await expect(page.getByText(/Showing 1 of \d+/)).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(MEMBER) })).toBeVisible();
  answerNextDialog(page, "Pat only");
  await page.getByRole("button", { name: "Save this view" }).click();
  await expect(page.getByRole("button", { name: "Pat only", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Pat only", exact: true })).toBeVisible();
});

test("§13 a recorded payment gets a numbered receipt that can be voided", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "payments");
  const receiptLink = page.getByRole("link", { name: /^\d{4}-\d{5}$/ }).first();
  await expect(receiptLink).toBeVisible();
  const number = (await receiptLink.textContent())!.trim();
  await receiptLink.click();
  await expect(page.getByText(number).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  answerNextDialog(page, "E2E test void");
  await page.getByRole("button", { name: "Void" }).click();
  await expect(page.getByText(/VOID/).first()).toBeVisible();
  await expect(page.getByText(/E2E test void/)).toBeVisible();
});

test("§14 add seats, see a vacancy, appoint an officer and end the term", async ({ page }) => {
  await signIn(page, "national");
  // a required seat for every chapter, and a seat for the national itself
  await open(page, nationalId, "board-settings");
  for (const [title, usedBy, required] of [
    ["President", /Every chapter/, true],
    ["Treasurer", /^This organization|^E2E Guide/, false],
  ] as const) {
    await page.getByRole("button", { name: "Add seat" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("combobox", { name: "Used by" }).click();
    await page.getByRole("option", { name: usedBy }).first().click();
    if (required) await dialog.getByText("Required (shown as vacant when empty)").click();
    await dialog.getByRole("button", { name: "Save seat" }).click();
    await expect(dialog).toHaveCount(0);
  }

  // the chapter's President is vacant and the warning lists it
  await open(page, chapterId, "board");
  await expect(page.getByText(/Required seats with nobody in them: President/)).toBeVisible();
  await expect(page.getByText("Vacant").first()).toBeVisible();

  // a role email must be an email
  await open(page, chapterId, "board-settings");
  await page
    .getByRole("row", { name: /President/ })
    .getByRole("button", { name: "Contact email" })
    .click();
  const contact = page.getByRole("dialog");
  await contact.getByRole("radio", { name: "A role email for this seat" }).click();
  await contact.getByLabel("Role email", { exact: true }).fill("not-an-email");
  await contact.getByRole("button", { name: "Save" }).click();
  await expect(contact).toBeVisible();
  await page.keyboard.press("Escape");

  // appoint Pat (in good standing) as the national's Treasurer, then end the term
  await open(page, nationalId, "board");
  await page.getByRole("button", { name: "Appoint" }).first().click();
  const appoint = page.getByRole("dialog", { name: /Appoint Treasurer/ });
  await appoint.getByRole("combobox", { name: "Member" }).click();
  await page.getByRole("option", { name: new RegExp(MEMBER) }).click();
  await appoint.getByRole("button", { name: "Appoint" }).click();
  await expect(appoint).toHaveCount(0);
  await expect(page.getByText(MEMBER).first()).toBeVisible();
  answerNextDialog(page, "Moved away");
  await page.getByRole("button", { name: "End term" }).click();
  await expect(page.getByRole("heading", { name: "Past officers" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Moved away" })).toBeVisible();
});

test("§7.4 and §14.4 cancel a membership; a lapsed member can't be appointed", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "members");
  await page
    .getByRole("row", { name: new RegExp(MEMBER) })
    .getByRole("button", { name: "Details" })
    .click();
  const details = page.getByRole("dialog");
  answerNextDialog(page);
  await details.getByRole("button", { name: "Cancel membership" }).click();
  await expect(details.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await open(page, nationalId, "board");
  await page.getByRole("button", { name: "Appoint" }).first().click();
  const appoint = page.getByRole("dialog", { name: /Appoint Treasurer/ });
  await appoint.getByRole("combobox", { name: "Member" }).click();
  await page.getByRole("option", { name: new RegExp(MEMBER) }).click();
  await appoint.getByRole("button", { name: "Appoint" }).click();
  await expect(page.locator("li[data-sonner-toast]").last()).toContainText(/good standing/i);
});

test("§3.1 a setting locked at the national is read-only at its chapter", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "settings");
  const row = page
    .getByText("Grace period (days)", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
  await row.getByRole("combobox", { name: "Chapter rule" }).click();
  await page.getByRole("option", { name: "Lock for all chapters" }).click();
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("li[data-sonner-toast]").last()).toContainText("Saved");

  await open(page, chapterId, "settings");
  const locked = page
    .getByText("Grace period (days)", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
  await expect(locked.getByText(`Locked by ${NAME}.`)).toBeVisible();
  await expect(locked.getByRole("button", { name: "Save" })).toHaveCount(0);
});

test("§1.4 an invitation link works once, for its email only, and can be revoked", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page, "national");
  await open(page, nationalId, "members");
  const invitee = `e2e-invite-${run}@example.org`;
  await page.getByRole("textbox", { name: "Email" }).fill(invitee);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/invite\//);

  // signed out: the invitation page asks to sign in; nothing is accepted on opening
  const visitor = await guardedPage(browser, baseURL);
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { name: "You've been invited" })).toBeVisible();

  // signed in as someone else: accepting is refused for a different email
  await signIn(visitor, "member");
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { name: `Join ${NAME}` })).toBeVisible();
  await visitor.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    visitor.getByText("This invitation was sent to a different email address."),
  ).toBeVisible();

  // revoked: the link no longer works
  await page.reload();
  await page
    .getByRole("row", { name: new RegExp(invitee) })
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(page.getByRole("row", { name: new RegExp(invitee) })).toContainText(/revoked/i);
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();
  await visitor.context().close();
});

test("§15 the audit log lists these changes in plain words", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "audit");
  await expect(page.getByText(/added Board settings · Treasurer/).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`appointed ${MEMBER} as Treasurer`))).toBeVisible();
  await expect(page.getByText(/added Membership levels · Regular/).first()).toBeVisible();
  // the national's log doesn't include its chapter's changes, and the other way round
  await open(page, chapterId, "audit");
  await expect(page.getByText(/Treasurer/)).toHaveCount(0);
});

test("§2b.4 a demo organization is deleted only after typing its exact name", async ({ page }) => {
  await signIn(page, "national");
  await open(page, nationalId, "settings");
  await page.getByRole("button", { name: "Delete demo organization" }).click();
  const dialog = page.getByRole("dialog");
  const go = dialog.getByRole("button", { name: "Delete for good" });
  await expect(go).toBeDisabled();
  await dialog.getByLabel(`Type ${NAME} to confirm`).fill(NAME.toLowerCase());
  await expect(go).toBeDisabled();
  await dialog.getByLabel(`Type ${NAME} to confirm`).fill(NAME);
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page).toHaveURL(/\/orgs$/);
  deleted = true;
  await expect(page.getByText(NAME)).toHaveCount(0);
});
