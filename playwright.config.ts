import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (A2, D-170): Chromium against the dev server and the live demo backend, like
 * `bun run test:smoke`. Tests sign in as the demo accounts (docs/demo-data.md); anything they
 * create in the demo orgs is removed afterwards with purge_smoke_data (D-150).
 * Run: `bun run test:e2e`. Set E2E_BASE_URL to test a deployed site instead of a local server.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 4310);
const external = process.env["E2E_BASE_URL"] || undefined;
const proxy = process.env["HTTPS_PROXY"] ?? process.env["https_proxy"];
// Playwright is pinned to 1.64.1 (D-186). Where its own Chromium can't be installed (some
// sandboxes ship a different build), point E2E_CHROMIUM_PATH at an existing Chromium binary.
const chromiumPath = process.env["E2E_CHROMIUM_PATH"] || undefined;

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
    launchOptions: {
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
          // Server functions call the backend from Node; behind a proxy, Node must use it too.
          ...(proxy ? { env: { NODE_USE_ENV_PROXY: "1" } } : {}),
          timeout: 180_000,
        },
      }),
});
