import { describe, expect, it } from "vitest";
import { normalizeOrigin, publicOrigin } from "./origin";

const h = (o: Record<string, string>) => new Headers(o);
const internal = "http://localhost:3000/_serverFn/abc";

describe("public origin for checkout return links (D-158)", () => {
  it("uses the browser's address, not the server's internal localhost URL", () => {
    expect(publicOrigin(h({ origin: "https://opencharter.lovable.app" }), internal)).toBe(
      "https://opencharter.lovable.app",
    );
    expect(
      publicOrigin(h({ referer: "https://preview.lovable.app/join/demo-national" }), internal),
    ).toBe("https://preview.lovable.app");
    expect(
      publicOrigin(
        h({ "x-forwarded-host": "app.example.org", "x-forwarded-proto": "https" }),
        internal,
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
    expect(publicOrigin(h({ origin: "null", referer: "https://ok.example/x" }), internal)).toBe(
      "https://ok.example",
    );
  });
});
