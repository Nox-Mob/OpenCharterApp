import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { stagingSetting } from "../smoke/client";

/**
 * Origin guard for end-to-end tests (D-186). The test browser may only load the app itself, its
 * Supabase backend and the web fonts it uses; every other request is blocked. The tests never
 * need the open web, so a page that tries to send the browser elsewhere (a bad link, an injected
 * script) gets nothing. Add hosts for one run with E2E_ALLOWED_HOSTS (comma-separated).
 */
export function allowedHosts(baseURL: string | undefined): Set<string> {
  const hosts = new Set(["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com"]);
  if (baseURL) hosts.add(new URL(baseURL).hostname);
  hosts.add(new URL(stagingSetting("VITE_SUPABASE_URL")).hostname);
  for (const h of (process.env["E2E_ALLOWED_HOSTS"] ?? "").split(","))
    if (h.trim()) hosts.add(h.trim().toLowerCase());
  return hosts;
}

/** Block every request to a host outside the allowed list, for one browser context. */
export async function guardContext(context: BrowserContext, baseURL: string | undefined) {
  const allowed = allowedHosts(baseURL);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!/^(https?|wss?):$/.test(url.protocol) || allowed.has(url.hostname))
      return route.continue();
    console.warn(`e2e origin guard blocked ${url.origin}`);
    return route.abort("blockedbyclient");
  });
}

/** A new page in its own guarded context (instead of browser.newPage()). */
export async function guardedPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext(baseURL ? { baseURL } : {});
  await guardContext(context, baseURL);
  return context.newPage();
}

export const test = base.extend<{ originGuard: void }>({
  originGuard: [
    async ({ context, baseURL }, use) => {
      await guardContext(context, baseURL);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page };
