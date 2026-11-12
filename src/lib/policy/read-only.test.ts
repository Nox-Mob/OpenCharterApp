import { describe, expect, it } from "vitest";
import { PERMISSIONS, READ_ONLY_SAFE, hasPermission, withoutWrites, type Grant } from "./index";

// S-05: while billing makes Charter read-only, pages render with write permissions removed.
describe("withoutWrites", () => {
  const org = { id: "chapter", ancestor_ids: ["national"] };
  const admin: Grant[] = [{ unit_id: "national", permissions: [...PERMISSIONS] }];

  it("keeps seeing and exporting, drops every write", () => {
    const ro = withoutWrites(admin);
    for (const p of PERMISSIONS) expect(hasPermission(ro, p, org)).toBe(READ_ONLY_SAFE.includes(p));
    expect(hasPermission(ro, "members.export", org)).toBe(true);
    expect(hasPermission(ro, "payments.manage", org)).toBe(false);
    expect(hasPermission(ro, "org.manage", org)).toBe(false);
  });

  it("never adds a permission and leaves the original grants alone", () => {
    const viewer: Grant[] = [{ unit_id: "chapter", permissions: ["org.view"] }];
    expect(withoutWrites(viewer)[0]?.permissions).toEqual(["org.view"]);
    withoutWrites(admin);
    expect(admin[0]?.permissions).toHaveLength(PERMISSIONS.length);
  });
});
