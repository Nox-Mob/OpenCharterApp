import { describe, expect, it } from "vitest";
import { availableRoles, canRemove, type Assignment } from "./index";

const a = (id: string, user_id: string, role_key: string, org_id = "org"): Assignment => ({ id, user_id, org_id, role_key });

describe("canRemove", () => {
  it("blocks removing the only admin of a top-level org", () => {
    const only = a("1", "u1", "org_admin");
    expect(canRemove(only, [only], false)).toBe(false);
  });
  it("allows removing one of two admins", () => {
    const all = [a("1", "u1", "org_admin"), a("2", "u2", "org_admin")];
    expect(canRemove(all[0]!, all, false)).toBe(true);
  });
  it("allows removing a chapter's only admin (national still manages it)", () => {
    const only = a("1", "u1", "org_admin");
    expect(canRemove(only, [only], true)).toBe(true);
  });
  it("member roles can always be removed", () => {
    const m = a("1", "u1", "member");
    expect(canRemove(m, [m], false)).toBe(true);
  });
  it("admins in other orgs don't count", () => {
    const all = [a("1", "u1", "org_admin", "org"), a("2", "u2", "org_admin", "other")];
    expect(canRemove(all[0]!, all, false)).toBe(false);
  });
});

describe("availableRoles", () => {
  it("hides roles the person already holds here", () => {
    expect(availableRoles("u1", "org", [a("1", "u1", "member")]).map((r) => r.key)).toEqual(["org_admin"]);
  });
  it("roles held elsewhere don't hide anything", () => {
    expect(availableRoles("u1", "org", [a("1", "u1", "member", "other")])).toHaveLength(2);
  });
});
