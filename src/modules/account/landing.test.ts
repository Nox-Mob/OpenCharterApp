import { describe, expect, it } from "vitest";
import { defaultOrgIdOf, landingOrgId } from "./landing";

const orgs = [{ id: "a" }, { id: "b" }];

describe("where a person lands after signing in (D-206)", () => {
  it("opens the default organization while they still belong to it", () => {
    expect(landingOrgId(orgs, "b")).toBe("b");
    expect(landingOrgId(orgs, "gone")).toBeNull();
  });

  it("opens the only organization, else shows the list", () => {
    expect(landingOrgId([{ id: "a" }], null)).toBe("a");
    expect(landingOrgId([{ id: "a" }], "gone")).toBe("a");
    expect(landingOrgId(orgs, null)).toBeNull();
    expect(landingOrgId([], null)).toBeNull();
  });

  it("reads the default from the account's metadata", () => {
    expect(defaultOrgIdOf({ user_metadata: { default_org_id: "a" } })).toBe("a");
    expect(defaultOrgIdOf({ user_metadata: { default_org_id: null } })).toBeNull();
    expect(defaultOrgIdOf({ user_metadata: {} })).toBeNull();
    expect(defaultOrgIdOf(null)).toBeNull();
  });
});
