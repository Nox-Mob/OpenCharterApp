import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { isPlaceholder, viteLines, workerVars } from "./worker-env.mjs";

const text = readFileSync("wrangler.jsonc", "utf8");

describe("wrangler.jsonc environments (D-219)", () => {
  it("production is hosted on the production project and the suite domains", () => {
    const vars = workerVars(text, "production");
    expect(vars.VITE_HOSTED).toBe("true");
    expect(vars.VITE_SUPABASE_URL).toBe("https://nxungwtxnctcqolfshcr.supabase.co");
    expect(vars.SUPABASE_URL).toBe(vars.VITE_SUPABASE_URL);
    expect(vars.SUPABASE_PUBLISHABLE_KEY).toBe(vars.VITE_SUPABASE_PUBLISHABLE_KEY);
    expect(vars.VITE_HUB_URL).toBe("https://openapphub.org");
    expect(vars.PUBLIC_APP_URL).toBe("https://charter.openapphub.org");
    expect(JSON.parse(vars.VITE_SUITE_URLS).charter).toBe("https://charter.openapphub.org");
    expect(isPlaceholder(vars)).toBe(false);
  });

  it("staging points at the staging project, never production", () => {
    const vars = workerVars(text, "staging");
    expect(vars.VITE_SUPABASE_URL).toBe("https://dnsqxiiexkdokgebysrt.supabase.co");
    expect(JSON.stringify(vars)).not.toContain("nxungwtxnctcqolfshcr");
    expect(JSON.parse(vars.VITE_SUITE_URLS).charter).toBe("https://charter-staging.openapphub.org");
  });

  it("the self-hosted default is not hosted and holds no real project", () => {
    const vars = workerVars(text, "top");
    expect(vars.VITE_HOSTED).toBe("false");
    expect(isPlaceholder(vars)).toBe(true);
  });

  it("only public VITE_* values go into the build, and no secrets are in the file", () => {
    const lines: string[] = viteLines(workerVars(text, "production"));
    expect(lines.every((l) => l.startsWith("VITE_"))).toBe(true);
    expect(text).not.toMatch(/sb_secret_|sk_live_|sk_test_|rk_live_|whsec_|eyJhbGci/);
  });
});
