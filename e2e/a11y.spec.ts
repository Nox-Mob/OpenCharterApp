import { expect, test, type Page } from "@playwright/test";
import { openOrg, signIn, type Role } from "./helpers";

// Accessibility pass (R2, WCAG 2.1 AA, Q-16), checked without extra dependencies:
// - every button, link, form field and combobox on the main screens has an accessible name
//   (WCAG 4.1.2 Name, Role, Value; 1.3.1 Info and Relationships)
// - every page has one level-1 heading and a language (2.4.6, 3.1.1)
// - the keyboard reaches the controls, and focus is visible (2.1.1, 2.4.7)
// Contrast in both themes and screen-reader wording are checked by hand (docs/user-testing.md §16).

/** Controls without an accessible name, described for the failure message. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="combobox"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"]';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const textOf = (id: string) => document.getElementById(id)?.textContent?.trim() ?? "";
    const name = (el: Element): string => {
      const aria = el.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map(textOf).join(" ").trim();
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      const wrap = el.closest("label");
      if (wrap?.textContent?.trim()) return wrap.textContent.trim();
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select")
        return (el.getAttribute("title") ?? "").trim();
      const text = (el.textContent ?? "").trim();
      if (text) return text;
      const img = el.querySelector("img[alt], svg[aria-label]");
      return (
        img?.getAttribute("alt") ??
        img?.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        ""
      ).trim();
    };
    return [...document.querySelectorAll(sel)]
      .filter((el) => visible(el) && el.getAttribute("aria-hidden") !== "true")
      .filter((el) => !name(el))
      .map((el) => el.outerHTML.slice(0, 160));
  });
}

async function checkPage(page: Page, where: string) {
  await page.waitForLoadState("networkidle");
  expect(await page.locator("html").getAttribute("lang"), `${where}: page language`).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1 }), `${where}: one main heading`).toHaveCount(
    1,
  );
  expect(await unnamedControls(page), `${where}: controls without a name`).toEqual([]);
}

const SCREENS: { role: Role; org: "national" | "austin"; tabs: string[] }[] = [
  {
    role: "national",
    org: "national",
    tabs: ["overview", "members", "board", "reports", "chapters", "settings", "levels", "payments"],
  },
  { role: "chapter", org: "austin", tabs: ["overview", "members", "board", "reports"] },
  { role: "member", org: "austin", tabs: ["overview", "directory", "board"] },
];

for (const { role, org, tabs } of SCREENS) {
  test(`${role}: controls are named on every main screen`, async ({ page }) => {
    await signIn(page, role);
    await checkPage(page, "dashboard");
    for (const tab of tabs) {
      await openOrg(page, org, tab);
      await checkPage(page, `${org} ${tab}`);
    }
  });
}

test("sign-in works by keyboard alone, with visible focus", async ({ page }) => {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await checkPage(page, "sign in");
  const email = page.getByLabel("Email");
  await email.focus();
  // focus is visible: an outline or a ring (box-shadow) on the focused field
  const ring = await email.evaluate((el) => {
    const s = getComputedStyle(el);
    return (s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none";
  });
  expect(ring, "focused field shows a focus indicator").toBe(true);
  await page.keyboard.type("demo-member@opencharter.test");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
});
