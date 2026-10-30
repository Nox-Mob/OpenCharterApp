import { describe, expect, it } from "vitest";
import { createOrgSchema, hasPermission } from "./index";

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
