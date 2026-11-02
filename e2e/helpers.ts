import { expect, type Page } from "@playwright/test";
import { DEMO } from "../smoke/client";

export { DEMO };
export type Role = "national" | "chapter" | "member";

/** Sign in through the real sign-in page as a demo account. */
export async function signIn(page: Page, role: Role) {
  await page.goto("/auth");
  // wait for the app to hydrate, or React resets fields typed into the server-rendered form
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(DEMO[role]);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Open a demo org's page, optionally on a section (?tab=). */
export async function openOrg(page: Page, org: keyof typeof DEMO.orgs, tab?: string) {
  await page.goto(`/orgs/${DEMO.orgs[org]}${tab ? `?tab=${tab}` : ""}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** The desktop left-hand menu of an org page. */
export const orgMenu = (page: Page) => page.getByRole("navigation", { name: "Organization" });
