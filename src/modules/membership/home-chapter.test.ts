import { describe, expect, it } from "vitest";
import {
  chapterChoices,
  homeChapterErrorMessage,
  rememberHomeChapter,
  takeRememberedHomeChapter,
} from "./home-chapter";
import { toMemberRow } from "./memberships";

const chapters = [
  { id: "a", name: "Austin", slug: "a" },
  { id: "o", name: "Online", slug: "o" },
  { id: "d", name: "Dallas", slug: "d" },
];

describe("home-chapter model (A8)", () => {
  it("offers the at-large chapter first, marked", () => {
    expect(chapterChoices({ chapters, at_large_chapter: "o" }).map((c) => c.name)).toEqual([
      "Online (members at large)",
      "Austin",
      "Dallas",
    ]);
    expect(chapterChoices({ chapters, at_large_chapter: null }).map((c) => c.id)).toEqual([
      "a",
      "o",
      "d",
    ]);
  });

  it("remembers the chapter picked on the join page for that national only, once", () => {
    rememberHomeChapter("nat", "a");
    expect(takeRememberedHomeChapter("other")).toBeNull();
    expect(takeRememberedHomeChapter("nat")).toEqual({ chapterId: "a" });
    expect(takeRememberedHomeChapter("nat")).toBeNull();
    rememberHomeChapter("nat", null);
    expect(takeRememberedHomeChapter("nat")).toEqual({ chapterId: null });
  });

  it("explains database errors", () => {
    expect(homeChapterErrorMessage("the membership model can't be changed once chosen")).toMatch(
      /can't be changed/,
    );
    expect(homeChapterErrorMessage("join first")).toBe("Join first, then pick your chapter");
    expect(homeChapterErrorMessage("boom")).toBe("Couldn't save the change");
  });

  it("a chapter record shows the national membership it stands for", () => {
    const m = {
      id: "m1",
      status: "active",
      paid_through: "2027-01-01",
      lifetime: false,
      joined_on: "2024-01-01",
      tier_id: "t",
      term_id: "tt",
      membership_tiers: { name: "Regular" },
      tier_terms: { label: "1 year" },
      home_org_id: "a",
    };
    const base = {
      id: "p",
      user_id: "u",
      display_name: "Yara",
      email: "y@x.org",
      source: "signup",
      created_at: "2026-01-01",
    };
    const viaNational = toMemberRow({
      ...base,
      memberships: [],
      home: m,
      home_of: "m1",
      left_at: null,
    });
    expect(viaNational.membership).toMatchObject({
      id: "m1",
      tier_name: "Regular",
      via_national: true,
    });
    expect(viaNational).not.toHaveProperty("home");
    const own = toMemberRow({ ...base, memberships: [{ ...m, id: "own" }], home: m });
    expect(own.membership).toMatchObject({ id: "own" });
    expect(own.membership?.via_national).toBeUndefined();
    expect(toMemberRow({ ...base, memberships: [] }).membership).toBeNull();
  });
});
