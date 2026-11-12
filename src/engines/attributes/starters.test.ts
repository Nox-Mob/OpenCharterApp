import { describe, expect, it } from "vitest";
import { STARTER_ATTRIBUTES, startersForTaxStatus } from "./index";

const keys = (taxStatus: string | null, chosen: string[] = []) =>
  startersForTaxStatus(STARTER_ATTRIBUTES, taxStatus, new Set(chosen)).map((s) => s.key);

describe("starter member fields by tax status", () => {
  it("offers Rank and Branch only to 501(c)(19) veterans organizations", () => {
    expect(keys("501(c)(19)")).toEqual(expect.arrayContaining(["rank", "branch"]));
    for (const status of ["501(c)(3)", "501(c)(6)", "other", null]) {
      expect(keys(status)).not.toContain("rank");
      expect(keys(status)).not.toContain("branch");
      expect(keys(status)).toContain("salutation");
    }
  });
  it("keeps a field that's already chosen, so it can be unticked", () => {
    expect(keys("501(c)(3)", ["rank"])).toContain("rank");
  });
});
