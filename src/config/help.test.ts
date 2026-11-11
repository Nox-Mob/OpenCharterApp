import { describe, expect, it } from "vitest";
import { HELP, helpHrefFor, helpKeyFor } from "./help";

describe("help links (S-04)", () => {
  it("every docs path is a section page or an app's home", () => {
    for (const path of Object.values(HELP))
      expect(path).toMatch(/^(charter|hub)\/([a-z-]+\/[a-z-]+\/)?$/);
  });

  it("each organization section opens its own page", () => {
    expect(helpKeyFor("/orgs/abc")).toBe("overview");
    expect(helpKeyFor("/orgs/abc", { tab: "members" })).toBe("members");
    expect(helpKeyFor("/orgs/abc", { tab: "directory" })).toBe("members");
    expect(helpKeyFor("/orgs/abc", { tab: "levels" })).toBe("levels");
    expect(helpKeyFor("/orgs/abc", { tab: "payments" })).toBe("payments");
    expect(helpKeyFor("/orgs/abc", { tab: "board-settings" })).toBe("board");
    expect(helpKeyFor("/orgs/abc", { tab: "audit" })).toBe("records");
    expect(helpKeyFor("/orgs/abc", { tab: "unknown" })).toBe("overview");
    expect(helpKeyFor("/orgs/abc/setup")).toBe("setup");
  });

  it("other pages, and anything unknown falls back to the app's docs home", () => {
    expect(helpKeyFor("/receipts/r1")).toBe("payments");
    expect(helpKeyFor("/account")).toBe("account");
    expect(helpKeyFor("/somewhere")).toBe("home");
    expect(helpHrefFor("/orgs/abc", { tab: "payments" })).toBe(
      "https://docs.openapphub.org/charter/money/payments/",
    );
  });
});
