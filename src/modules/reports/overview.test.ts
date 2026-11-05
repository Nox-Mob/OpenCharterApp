import { describe, expect, it } from "vitest";
import { averagePerChapter, lifetimeSplit, percent } from "./overview";

describe("overview numbers", () => {
  it("averages current members per chapter", () => {
    expect(averagePerChapter({ chapters: 3, chapter_memberships: 10 })).toBe(3.3);
    expect(averagePerChapter({ chapters: 4, chapter_memberships: 0 })).toBe(0);
    expect(averagePerChapter({ chapters: 0, chapter_memberships: 5 })).toBeNull();
  });

  it("splits lifetime and other current members", () => {
    expect(lifetimeSplit({ current_members: 40, lifetime_members: 10 })).toEqual({
      lifetime: 10,
      other: 30,
      share: 0.25,
    });
    expect(lifetimeSplit({ current_members: 0, lifetime_members: 0 })).toEqual({
      lifetime: 0,
      other: 0,
      share: 0,
    });
    // never more lifetime members than current ones
    expect(lifetimeSplit({ current_members: 2, lifetime_members: 3 }).other).toBe(0);
    expect(percent(0.255)).toBe("26%");
  });
});
