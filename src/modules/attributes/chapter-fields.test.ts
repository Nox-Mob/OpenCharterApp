import { describe, expect, it } from "vitest";
import { canSetChapterField } from "./chapter-fields";

const chapter = { id: "a", ancestor_ids: ["nat", "region"] };
const nationalAdmin = [{ org_id: "nat", permissions: ["org.manage"] }];
const regionAdmin = [{ org_id: "region", permissions: ["org.manage"] }];
const chapterAdmin = [{ org_id: "a", permissions: ["org.manage"] }];

describe("canSetChapterField", () => {
  const open = { org_id: "nat", locked: false };
  const locked = { org_id: "nat", locked: true };
  it("chapter admins set unlocked fields", () => {
    expect(canSetChapterField(open, chapter, chapterAdmin)).toBe(true);
  });
  it("only the defining org's admins set locked fields", () => {
    expect(canSetChapterField(locked, chapter, chapterAdmin)).toBe(false);
    expect(canSetChapterField(locked, chapter, regionAdmin)).toBe(false);
    expect(canSetChapterField(locked, chapter, nationalAdmin)).toBe(true);
  });
  it("a region's locked field can be set by region or national admins", () => {
    const regional = { org_id: "region", locked: true };
    expect(canSetChapterField(regional, chapter, regionAdmin)).toBe(true);
    expect(canSetChapterField(regional, chapter, nationalAdmin)).toBe(true);
    expect(canSetChapterField(regional, chapter, chapterAdmin)).toBe(false);
  });
  it("needs org.manage on the chapter and the field must apply to it", () => {
    expect(
      canSetChapterField(open, chapter, [{ org_id: "a", permissions: ["members.view"] }]),
    ).toBe(false);
    expect(canSetChapterField({ org_id: "other", locked: false }, chapter, nationalAdmin)).toBe(
      false,
    );
  });
});
