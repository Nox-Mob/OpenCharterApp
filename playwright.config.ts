import { defineConfig, devices } from "@playwright/test";
import { stagingSetting } from "./smoke/client";

/**
 * End-to-end tests (A2, D-170): Chromium against the dev server running self-hosted (its own
 * sign-in page) on STAGING, signed in as the suite demo accounts (docs/demo-data.md); the demo is
 * reset every 12 hours. Staging's public settings come from wrangler.jsonc env.staging, so no
 * secrets are needed. Run: `bun run test:e2e`. E2E_BASE_URL tests a deployed site instead.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 4310);
const external = process.env["E2E_BASE_URL"] || undefined;
const proxy = process.env["HTTPS_PROXY"] ?? process.env["https_proxy"];
// Playwright is pinned to 1.64.1 (D-186). Where its own Chromium can't be installed (some
// sandboxes ship a different build), point E2E_CHROMIUM_PATH at an existing Chromium binary.
const chromiumPath = process.env["E2E_CHROMIUM_PATH"] || undefined;
const channel = process.env["E2E_BROWSER_CHANNEL"] || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: external ?? `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // Behind an outbound proxy (some sandboxes), send the backend calls through it.
    // Hardening (D-186): Chromium's sandbox is on (Playwright's default is off). It can't run as
    // root, so a root-only sandbox sets E2E_NO_SANDBOX=1. E2E_BROWSER_CHANNEL=chrome uses the
    // installed Google Chrome (kept current by its own updates) instead of Playwright's bundled
    // Chromium, which lags Chrome stable; CI does this. Every spec also blocks requests to hosts
    // other than the app and its backend (e2e/fixtures.ts).
    ...(channel ? { channel } : {}),
    launchOptions: {
      chromiumSandbox: process.env["E2E_NO_SANDBOX"] !== "1",
      ...(proxy ? { proxy: { server: proxy, bypass: "127.0.0.1,localhost" } } : {}),
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(external
    ? {}
    : {
        webServer: {
          command: `bun run dev --host 127.0.0.1 --port ${PORT} --strictPort`,
          url: `http://127.0.0.1:${PORT}`,
          reuseExistingServer: !process.env["CI"],
          env: {
            VITE_HOSTED: "false",
            VITE_SUPABASE_URL: stagingSetting("VITE_SUPABASE_URL"),
            VITE_SUPABASE_PUBLISHABLE_KEY: stagingSetting("VITE_SUPABASE_PUBLISHABLE_KEY"),
            SUPABASE_URL: stagingSetting("VITE_SUPABASE_URL"),
            SUPABASE_PUBLISHABLE_KEY: stagingSetting("VITE_SUPABASE_PUBLISHABLE_KEY"),
            // Server functions call the backend from Node; behind a proxy, Node must use it too.
            ...(proxy ? { NODE_USE_ENV_PROXY: "1" } : {}),
          },
          timeout: 180_000,
        },
      }),
});
