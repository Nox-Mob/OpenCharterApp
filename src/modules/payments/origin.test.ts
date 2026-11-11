import { describe, expect, it } from "vitest";
import { normalizeOrigin, publicOrigin } from "./origin";

const h = (o: Record<string, string>) => new Headers(o);
const internal = "http://localhost:3000/_serverFn/abc";

describe("public origin for checkout return links (D-158)", () => {
  it("uses the browser's address, not the server's internal localhost URL", () => {
    const site = "https://charter.openapphub.org";
    expect(publicOrigin(h({ origin: site }), internal, undefined, site)).toBe(site);
    expect(
      publicOrigin(h({ referer: `${site}/join/demo-national` }), internal, undefined, site),
    ).toBe(site);
    expect(
      publicOrigin(
        h({ "x-forwarded-host": "app.example.org", "x-forwarded-proto": "https" }),
        internal,
        undefined,
        "https://app.example.org",
      ),
    ).toBe("https://app.example.org");
  });

  it("prefers PUBLIC_APP_URL when the operator sets it", () => {
    expect(
      publicOrigin(h({ origin: "https://a.example" }), internal, "https://members.example.org/"),
    ).toBe("https://members.example.org");
  });

  it("falls back to the request URL for local development", () => {
    expect(publicOrigin(h({}), internal)).toBe("http://localhost:3000");
    expect(publicOrigin(h({ origin: "http://localhost:5173" }), internal)).toBe(
      "http://localhost:5173",
    );
  });

  it("ignores unusable values", () => {
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("http://evil.example")).toBeNull(); // plain http only for localhost
    expect(normalizeOrigin("not a url")).toBeNull();
    expect(
      publicOrigin(
        h({ origin: "null", referer: "https://ok.example/x" }),
        internal,
        undefined,
        "https://ok.example",
      ),
    ).toBe("https://ok.example");
  });

  it("refuses origins that aren't on the allowlist, old hosts included (D-219)", () => {
    expect(publicOrigin(h({ origin: "https://opencharter.old-host.example" }), internal)).toBe(
      "http://localhost:3000",
    );
    expect(publicOrigin(h({ origin: "https://evil.example" }), internal)).toBe(
      "http://localhost:3000",
    );
    expect(publicOrigin(h({ "x-forwarded-host": "evil.example" }), internal)).toBe(
      "http://localhost:3000",
    );
  });
});
