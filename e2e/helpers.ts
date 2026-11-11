import { expect, type Page } from "./fixtures";
import { DEMO } from "../smoke/client";

export { DEMO };

/**
 * The suite demo (OpenAppHub db/seed/0002_suite_demo.sql, reset every 12 hours): `owner` is
 * demo@demo.openapphub.org, who owns Riverside Community Association; `empty` is
 * test@demo.openapphub.org, an account with no organization.
 */
export type Who = "owner" | "empty";

/** Sign in through the app's own sign-in page (the tests run the app self-hosted on staging). */
export async function signIn(page: Page, who: Who) {
  await page.goto("/auth");
  // wait for the app to hydrate, or React resets fields typed into the server-rendered form
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(who === "owner" ? DEMO.owner : DEMO.empty);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // the owner lands on Riverside; the empty account on the (empty) list of organizations
  await expect(page).toHaveURL(/\/orgs(\/|$)/);
}

/** Open Riverside, optionally on a section (?tab=). */
export async function openRiverside(page: Page, tab?: string) {
  await page.goto(`/orgs/${DEMO.org}${tab ? `?tab=${tab}` : ""}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Riverside Community Association" }),
  ).toBeVisible();
}

/** The organization's menu in the left sidebar. */
export const orgMenu = (page: Page) => page.getByRole("navigation", { name: "Organization" });
