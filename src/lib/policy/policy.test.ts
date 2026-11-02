import { describe, expect, it } from "vitest";
import { createOrgSchema, grantsForView, hasAdminAccess, hasPermission } from "./index";

const national = { id: "n", ancestor_ids: [] };
const chapterA = { id: "a", ancestor_ids: ["n"] };
const chapterB = { id: "b", ancestor_ids: ["n"] };

describe("hasPermission (D-032 downward-only inheritance)", () => {
  it("national admin grant applies to its chapters", () => {
    expect(hasPermission([{ org_id: "n", permissions: ["org.view"] }], "org.view", chapterA)).toBe(
      true,
    );
  });
  it("chapter admin grant does not apply to the national", () => {
    expect(hasPermission([{ org_id: "a", permissions: ["org.view"] }], "org.view", national)).toBe(
      false,
    );
  });
  it("chapter admin grant does not apply to a sibling chapter", () => {
    expect(hasPermission([{ org_id: "a", permissions: ["org.view"] }], "org.view", chapterB)).toBe(
      false,
    );
  });
  it("a grant without the permission does not authorize", () => {
    expect(
      hasPermission([{ org_id: "a", permissions: ["org.view"] }], "audit.view", chapterA),
    ).toBe(false);
  });
});

describe("createOrgSchema", () => {
  it("rejects a chapter without a parent", () => {
    expect(
      createOrgSchema.safeParse({ name: "Austin", slug: "austin", type: "chapter", parentId: null })
        .success,
    ).toBe(false);
  });
  it("rejects a national with a parent", () => {
    const parentId = "00000000-0000-4000-8000-000000000000";
    expect(
      createOrgSchema.safeParse({ name: "Nat", slug: "nat", type: "national", parentId }).success,
    ).toBe(false);
  });
  it("accepts a standalone org", () => {
    expect(
      createOrgSchema.safeParse({
        name: "Elm Club",
        slug: "elm-club",
        type: "standalone",
        parentId: null,
      }).success,
    ).toBe(true);
  });
});

describe("view as member (D-155)", () => {
  const nat = { id: "n", ancestor_ids: [] as string[] };
  const ch = { id: "c", ancestor_ids: ["n"] };
  const grants = [{ org_id: "n", permissions: ["members.view", "org.manage"] }];
  it("offers the preview only to someone with an admin permission here", () => {
    expect(hasAdminAccess(grants, nat)).toBe(true);
    expect(hasAdminAccess(grants, ch)).toBe(true);
    expect(hasAdminAccess([], nat)).toBe(false);
    expect(hasAdminAccess([{ org_id: "c", permissions: ["members.view"] }], nat)).toBe(false);
  });
  it("drops every grant while previewing", () => {
    expect(grantsForView(grants, false)).toBe(grants);
    expect(grantsForView(grants, true)).toEqual([]);
    expect(hasPermission(grantsForView(grants, true), "members.view", nat)).toBe(false);
  });
});
