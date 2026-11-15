import { describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, withSecurityHeaders } from "./security-headers";

const supabase = "https://abc.supabase.co";

describe("security headers (spec §10.1, D-219)", () => {
  it("adds the four headers to a rendered page", () => {
    const res = withSecurityHeaders(new Response("<html></html>", { status: 200 }), supabase);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("keeps the status, body and headers already set", async () => {
    const res = withSecurityHeaders(
      new Response("err", { status: 500, headers: { "X-Frame-Options": "SAMEORIGIN" } }),
      supabase,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("err");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("allows only the app, its Supabase project and Google Fonts", () => {
    const csp = contentSecurityPolicy(`${supabase}/`);
    expect(csp).toContain(`connect-src 'self' ${supabase} wss://abc.supabase.co`);
    expect(csp).toContain(`img-src 'self' data: blob: ${supabase}`);
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("*");
  });

  it("falls back to self when the Supabase URL is missing or unusable", () => {
    expect(contentSecurityPolicy(undefined)).toContain("connect-src 'self';");
    expect(contentSecurityPolicy("javascript:alert(1)")).toContain("connect-src 'self';");
  });
});

describe("Cloudflare Web Analytics in the CSP (production only)", () => {
  it("isn't allowed without the production token", () => {
    vi.stubEnv("VITE_CF_ANALYTICS_TOKEN", "");
    expect(contentSecurityPolicy("https://abc.supabase.co")).not.toContain("cloudflareinsights");
    vi.unstubAllEnvs();
  });
  it("allows only the beacon script and its reporting endpoint with the token", () => {
    vi.stubEnv("VITE_CF_ANALYTICS_TOKEN", "054d7738b858425f863060e1c3b9dbb3");
    const csp = contentSecurityPolicy("https://abc.supabase.co");
    expect(csp).toMatch(/script-src [^;]*https:\/\/static\.cloudflareinsights\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/cloudflareinsights\.com/);
    vi.unstubAllEnvs();
  });
});
