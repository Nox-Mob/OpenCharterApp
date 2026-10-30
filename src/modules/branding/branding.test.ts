import { describe, expect, it } from "vitest";
import { resolveLogo, validateLogo } from "./index";

const chain = [
  { id: "national", logo_path: "n.png" },
  { id: "region", logo_path: null },
  { id: "chapter", logo_path: "c.png" },
];

describe("resolveLogo", () => {
  it("uses the chapter's own logo when allowed", () => {
    expect(resolveLogo(chain, true)?.orgId).toBe("chapter");
  });
  it("uses the national logo when chapter logos are not allowed", () => {
    expect(resolveLogo(chain, false)?.orgId).toBe("national");
  });
  it("falls back to the national logo when the chapter has none", () => {
    expect(resolveLogo([chain[0]!, { id: "chapter", logo_path: null }], true)?.orgId).toBe("national");
  });
  it("returns null when nobody has a logo", () => {
    expect(resolveLogo([{ id: "x", logo_path: null }], true)).toBeNull();
  });
});

describe("validateLogo", () => {
  it("rejects files over 2 MB", () => {
    expect(validateLogo({ type: "image/png", size: 2 * 1024 * 1024 + 1 })).not.toBeNull();
  });
  it("rejects non-image files", () => {
    expect(validateLogo({ type: "application/pdf", size: 10 })).not.toBeNull();
  });
  it("accepts a small PNG", () => {
    expect(validateLogo({ type: "image/png", size: 1000 })).toBeNull();
  });
});
