import { describe, expect, it } from "vitest";
import { visibleQuestions, visibleSteps, type FlowContext } from "@/engines/setup";
import { initialAnswers, membershipFlow } from "./setup-flow";

// Home-chapter model (D-166, D-184): members belong to the national, so setup doesn't ask about
// chapter acceptance, chapter levels or chapter dues, and a chapter has no joining step.
const national: FlowContext = {
  orgType: "national",
  orgName: "Nat",
  twoLevelDues: true,
  homeChapter: true,
};
const chapter: FlowContext = { orgType: "chapter", orgName: "Austin", homeChapter: true };

const questionIds = (ctx: FlowContext) => {
  const a = initialAnswers(null, ctx);
  return visibleSteps(membershipFlow, a, ctx).flatMap((s) =>
    visibleQuestions(s, a, ctx).map((q) => q.id),
  );
};

describe("Membership setup in the home-chapter model (D-184)", () => {
  it("asks a national about joining, but not about chapter acceptance, levels or dues", () => {
    const ids = questionIds(national);
    expect(ids).toEqual(expect.arrayContaining(["approval_required", "grace_days", "tiers"]));
    for (const id of [
      "chapter_acceptance",
      "lock_joining",
      "child_levels_allowed",
      "national_dues_required",
      "chapter_dues_required",
      "chapter_dues_min",
      "chapter_dues_max",
    ])
      expect(ids).not.toContain(id);
    expect(ids).toContain("chapter_logo_allowed");
  });

  it("writes none of the chapter membership rules for a national", () => {
    const plan = membershipFlow.plan(initialAnswers(null, national), national);
    const keys = plan.settings.map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining(["membership.grace_days", "branding.chapter_logo_allowed"]),
    );
    for (const k of [
      "membership.child_approval",
      "membership.child_levels_allowed",
      "membership.national_dues_required",
      "membership.chapter_dues",
    ])
      expect(keys).not.toContain(k);
    expect(
      membershipFlow.summarize(initialAnswers(null, national), national).join("\n"),
    ).not.toMatch(/accepted|own membership levels|your dues/);
  });

  it("gives a chapter no levels, joining or grace period of its own", () => {
    const ids = questionIds(chapter);
    expect(ids).not.toContain("tiers");
    expect(ids).not.toContain("approval_required");
    expect(ids).not.toContain("grace_days");
    const a = initialAnswers(null, chapter);
    const plan = membershipFlow.plan(a, chapter);
    expect(plan.settings).toEqual([]);
    expect(plan.tiers).toBeUndefined();
    expect(membershipFlow.summarize(a, chapter)).toContain(
      "Members join your national organization, which handles approval and renewals",
    );
  });

  it("asks the separate model everything as before", () => {
    const ids = questionIds({ ...national, homeChapter: false });
    expect(ids).toEqual(
      expect.arrayContaining([
        "chapter_acceptance",
        "child_levels_allowed",
        "national_dues_required",
      ]),
    );
  });
});
