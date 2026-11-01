import { describe, expect, it } from "vitest";
import {
  addedPermissions,
  availableRoles,
  canGrantRole,
  canRemove,
  grantablePermissions,
  roleErrorMessage,
  roleInputSchema,
  roleKey,
  rolesForOrg,
  validateNewRole,
  type Assignment,
  type Role,
} from "./index";
import { PERMISSIONS } from "@/lib/policy";

const a = (id: string, user_id: string, role_key: string, org_id = "org"): Assignment => ({
  id,
  user_id,
  org_id,
  role_key,
});
const role = (key: string, org_id: string | null, permissions: string[], active = true): Role => ({
  id: key,
  org_id,
  key,
  name: key,
  description: "",
  active,
  permissions,
});

const national = { id: "nat", ancestor_ids: [] };
const chapterA = { id: "a", ancestor_ids: ["nat"] };
const ALL = [...PERMISSIONS];
const admin = role("org_admin", null, ALL);
const member = role("member", null, []);
const treasurer = role("treasurer", "nat", ["members.view", "audit.view"]);
const secretary = role("secretary", "a", ["members.view"]);
const otherChapter = role("b_only", "b", ["members.view"]);
const retired = role("old", "nat", ["members.view"], false);
const roles = [admin, member, treasurer, secretary, otherChapter, retired];

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

describe("rolesForOrg", () => {
  it("includes platform, ancestor and own roles; never siblings or retired roles", () => {
    expect(rolesForOrg(roles, chapterA).map((r) => r.key)).toEqual([
      "member",
      "org_admin",
      "treasurer",
      "secretary",
    ]);
  });
  it("a national doesn't see its chapters' roles as usable (downward only)", () => {
    expect(rolesForOrg(roles, national).map((r) => r.key)).toEqual([
      "member",
      "org_admin",
      "treasurer",
    ]);
  });
});

describe("canGrantRole and availableRoles", () => {
  const limited = [{ org_id: "a", permissions: ["roles.manage", "members.view"] }];
  const chapterAdmin = [{ org_id: "a", permissions: ALL }];
  it("a role can only be granted by someone holding all its permissions", () => {
    expect(canGrantRole(secretary, limited, chapterA)).toBe(true);
    expect(canGrantRole(treasurer, limited, chapterA)).toBe(false);
    expect(canGrantRole(admin, limited, chapterA)).toBe(false);
  });
  it("grants on a child never reach the parent", () => {
    expect(canGrantRole(secretary, limited, national)).toBe(false);
  });
  it("hides roles already held here and roles the assigner can't grant", () => {
    const usable = rolesForOrg(roles, chapterA);
    const held = [a("1", "u1", "member", "a")];
    expect(availableRoles("u1", "a", held, usable, limited, chapterA).map((r) => r.key)).toEqual([
      "secretary",
    ]);
    expect(
      availableRoles("u1", "a", held, usable, chapterAdmin, chapterA).map((r) => r.key),
    ).toEqual(["org_admin", "treasurer", "secretary"]);
  });
  it("roles held elsewhere don't hide anything", () => {
    const usable = rolesForOrg(roles, chapterA);
    expect(
      availableRoles("u1", "a", [a("1", "u1", "member", "b")], usable, chapterAdmin, chapterA),
    ).toHaveLength(4);
  });
});

describe("grantablePermissions and addedPermissions", () => {
  it("lists only permissions held at this org", () => {
    expect(
      grantablePermissions([{ org_id: "a", permissions: ["members.view"] }], chapterA),
    ).toEqual(["members.view"]);
  });
  it("only additions need to be held", () => {
    expect(addedPermissions(["audit.view", "members.view"], ["members.view", "org.view"])).toEqual([
      "org.view",
    ]);
  });
});

describe("role input", () => {
  it("derives a stable key from the name", () => {
    expect(roleKey("Vice President!")).toBe("vice_president");
    expect(roleKey("2nd Officer")).toBe("r_2nd_officer");
  });
  it("needs a name and at least one known permission", () => {
    expect(
      roleInputSchema.safeParse({ name: "", description: "", permissions: ["org.view"] }).success,
    ).toBe(false);
    expect(roleInputSchema.safeParse({ name: "X", description: "", permissions: [] }).success).toBe(
      false,
    );
    expect(
      roleInputSchema.safeParse({ name: "X", description: "", permissions: ["nope"] }).success,
    ).toBe(false);
    expect(
      roleInputSchema.safeParse({ name: "X", description: "", permissions: ["org.view"] }).success,
    ).toBe(true);
  });
  it("rejects reserved and duplicate names", () => {
    const base = { description: "", permissions: ["org.view" as const] };
    expect(validateNewRole({ ...base, name: "Member" }, [])).toMatch(/reserved/);
    expect(validateNewRole({ ...base, name: "Treasurer" }, ["treasurer"])).toMatch(
      /already exists/,
    );
    expect(validateNewRole({ ...base, name: "Historian" }, ["treasurer"])).toBeNull();
  });
  it("maps database errors to friendly text", () => {
    expect(roleErrorMessage("you can only grant permissions you hold")).toBe(
      "You can only grant permissions you hold",
    );
    expect(roleErrorMessage("boom")).toBe("Couldn't save the role");
  });
});
