import { describe, expect, it } from "vitest";
import {
  diffByKey,
  flowVersion,
  pruneAnswers,
  validateStep,
  visibleQuestions,
  visibleSteps,
  type FlowContext,
  type Step,
} from "./index";
import { initialAnswers, membershipFlow } from "@/modules/membership/setup-flow";
import { STARTER_ATTRIBUTES, STARTER_CHAPTER_ATTRIBUTES } from "@/engines/attributes";
import { newTerm, withLength, type Tier } from "@/modules/membership/tiers";

const national = { orgType: "national", orgName: "Nat" };
const chapter = { orgType: "chapter", orgName: "Austin" };
const standalone = { orgType: "standalone", orgName: "Elm Club" };

describe("visibleSteps", () => {
  it("shows chapter rules only to national and region orgs", () => {
    expect(visibleSteps(membershipFlow, {}, national).map((s) => s.id)).toContain("chapters");
    expect(visibleSteps(membershipFlow, {}, standalone).map((s) => s.id)).not.toContain("chapters");
    expect(visibleSteps(membershipFlow, {}, chapter).map((s) => s.id)).not.toContain("chapters");
  });
});

describe("validateStep", () => {
  const about = membershipFlow.steps.find((s) => s.id === "about")!;
  const joining = membershipFlow.steps.find((s) => s.id === "joining")!;
  it("requires legal name and tax status", () => {
    expect(Object.keys(validateStep(about, { legal_name: " ", tax_status: "" }))).toEqual([
      "legal_name",
      "tax_status",
    ]);
  });
  it("checks EIN format only when given", () => {
    expect(validateStep(about, { legal_name: "X", tax_status: "other", ein: "" })).toEqual({});
    expect(
      validateStep(about, { legal_name: "X", tax_status: "other", ein: "123" })["ein"],
    ).toMatch(/12-3456789/);
  });
  it("rejects grace periods outside 0-365 days", () => {
    expect(validateStep(joining, { grace_days: 400 })["grace_days"]).toBeDefined();
    expect(validateStep(joining, { grace_days: -1 })["grace_days"]).toBeDefined();
    expect(validateStep(joining, { grace_days: 30 })).toEqual({});
  });
  it("rejects choices that aren't offered", () => {
    expect(
      validateStep(about, { legal_name: "X", tax_status: "made-up" })["tax_status"],
    ).toBeDefined();
  });
  it("supports number questions without bounds", () => {
    const s: Step = { id: "s", title: "s", questions: [{ id: "n", type: "number", label: "N" }] };
    expect(validateStep(s, { n: "abc" })["n"]).toBe("Enter a number");
  });
});

describe("membership plan", () => {
  it("prefills legal name from the org and grace days of 30", () => {
    const a = initialAnswers(null, standalone);
    expect(a["legal_name"]).toBe("Elm Club");
    expect(a["grace_days"]).toBe(30);
  });
  it("saved draft answers win over defaults", () => {
    expect(initialAnswers({ grace_days: 10 }, standalone)["grace_days"]).toBe(10);
  });
  // v3 (D-130): the lock covers only the grace period; chapter acceptance is its own rule,
  // so a national's own approval choice is never forced onto its chapters.
  it("a national that locks the grace period sets its rules for chapters separately", () => {
    const plan = membershipFlow.plan(
      {
        ...initialAnswers(null, national),
        lock_joining: true,
        chapter_logo_allowed: false,
        chapter_acceptance: "auto",
      },
      national,
    );
    expect(plan.settings).toEqual([
      { key: "membership.approval_required", value: false, mode: "override" },
      { key: "membership.grace_days", value: 30, mode: "locked" },
      { key: "membership.child_approval", value: "auto", mode: "locked" },
      { key: "branding.chapter_logo_allowed", value: false, mode: "locked" },
      { key: "membership.child_levels_allowed", value: true, mode: "locked" },
    ]);
  });
  it("a national can require approval itself while auto-accepting for chapters", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, national), approval_required: true, chapter_acceptance: "auto" },
      national,
    );
    expect(plan.settings).toContainEqual({
      key: "membership.approval_required",
      value: true,
      mode: "override",
    });
    expect(plan.settings).toContainEqual({
      key: "membership.child_approval",
      value: "auto",
      mode: "locked",
    });
  });
  it("a standalone org never locks and has no chapter settings", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, standalone), lock_joining: true },
      standalone,
    );
    expect(plan.settings.every((s) => s.mode === "override")).toBe(true);
    expect(plan.settings.map((s) => s.key)).not.toContain("branding.chapter_logo_allowed");
    expect(plan.settings.map((s) => s.key)).not.toContain("membership.child_levels_allowed");
  });
  it("attributes are planned as member attributes", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, standalone), attributes: [STARTER_ATTRIBUTES[1]] },
      standalone,
    );
    expect(plan.attributes[0]).toMatchObject({
      key: "rank",
      applies_to: "member",
      data_type: "ordered",
    });
  });
  it("chapter fields are planned as chapter attributes for nationals only", () => {
    const answers = {
      ...initialAnswers(null, national),
      attributes: [STARTER_ATTRIBUTES[1]],
      chapter_attributes: [{ ...STARTER_CHAPTER_ATTRIBUTES[0]!, member_editable: true }],
    };
    const plan = membershipFlow.plan(answers, national);
    expect(plan.attributes.map((x) => [x.key, x.applies_to])).toEqual([
      ["rank", "member"],
      ["charter_date", "chapter"],
    ]);
    expect(plan.attributes[1]).toMatchObject({ member_editable: false, show_in_directory: false });
    expect(membershipFlow.plan(answers, standalone).attributes.map((x) => x.key)).toEqual(["rank"]);
  });
  it("the chapter fields step is shown to nationals and regions only", () => {
    const ids = (ctx: typeof national) => visibleSteps(membershipFlow, {}, ctx).map((s) => s.id);
    expect(ids(national)).toContain("chapter_fields");
    expect(ids({ orgType: "region", orgName: "R" })).toContain("chapter_fields");
    expect(ids(standalone)).not.toContain("chapter_fields");
    expect(ids(chapter)).not.toContain("chapter_fields");
  });
  it("summary lists chapter fields for nationals", () => {
    const lines = membershipFlow.summarize(
      { ...initialAnswers(null, national), chapter_attributes: [STARTER_CHAPTER_ATTRIBUTES[0]] },
      national,
    );
    expect(lines).toContain("Track 1 chapter field: Charter date");
  });
  it("summary describes grace days and chapter rules in plain language", () => {
    const lines = membershipFlow.summarize(
      { ...initialAnswers(null, national), grace_days: 15, lock_joining: true },
      national,
    );
    expect(lines).toContain("Grace period: 15 days");
    expect(lines).toContain("Chapters must use your grace period");
    expect(lines).toContain("Each chapter decides whether new members need approval");
  });
  it("pruneAnswers drops answers for hidden steps", () => {
    const a = pruneAnswers(
      membershipFlow,
      { ...initialAnswers(null, standalone), lock_joining: true },
      standalone,
    );
    expect(a).not.toHaveProperty("lock_joining");
  });
});

describe("diffByKey", () => {
  it("marks new, changed and unchanged attributes", () => {
    const d = diffByKey(
      [
        { key: "rank", label: "Rank", options: [{ value: "E1" }, { value: "E2" }] },
        { key: "phone", label: "Phone" },
        { key: "branch", label: "Service branch" },
      ],
      [
        { key: "rank", label: "Rank", options: [{ value: "E1" }, { value: "E2" }] },
        { key: "branch", label: "Branch" },
      ],
    );
    expect(d.map((x) => x.change)).toEqual(["same", "add", "update"]);
  });
});

describe("membership levels (E-11)", () => {
  const regular: Tier = {
    key: "regular",
    name: "Regular",
    description: "",
    tax_treatment: "non_deductible",
    terms: [
      { ...newTerm(), price_minor: 2500 },
      { ...withLength(newTerm(), null), price_minor: 30000 },
    ],
  };
  const managedChapter = { ...chapter, childLevelsAllowed: false };
  it("asks for levels unless a parent manages them", () => {
    const ids = (ctx: typeof national) => visibleSteps(membershipFlow, {}, ctx).map((s) => s.id);
    expect(ids(standalone)).toContain("levels");
    expect(ids(chapter)).toContain("levels");
    expect(ids(managedChapter)).not.toContain("levels");
  });
  it("plans levels with their terms in minor units", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, standalone), tiers: [regular] },
      standalone,
    );
    expect(plan.tiers).toEqual([
      {
        key: "regular",
        name: "Regular",
        description: "",
        tax_treatment: "non_deductible",
        terms: [
          {
            key: "1_year",
            label: "1 year",
            length_count: 1,
            length_unit: "year",
            price_minor: 2500,
            currency: "USD",
          },
          {
            key: "lifetime",
            label: "Lifetime",
            length_count: null,
            length_unit: null,
            price_minor: 30000,
            currency: "USD",
          },
        ],
      },
    ]);
  });
  it("never sends levels when a parent manages them", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, managedChapter), tiers: [regular] },
      managedChapter,
    );
    expect(plan).not.toHaveProperty("tiers");
  });
  it("lets a national keep chapters on its levels", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, national), child_levels_allowed: false },
      national,
    );
    expect(plan.settings).toContainEqual({
      key: "membership.child_levels_allowed",
      value: false,
      mode: "locked",
    });
    expect(
      membershipFlow.summarize(
        { ...initialAnswers(null, national), child_levels_allowed: false },
        national,
      ),
    ).toContain("Chapters use your membership levels");
  });
  it("summarizes levels with their prices", () => {
    const lines = membershipFlow.summarize(
      { ...initialAnswers(null, standalone), tiers: [regular] },
      standalone,
    );
    expect(lines).toContain("Regular: 1 year $25.00, Lifetime $300.00");
    expect(
      membershipFlow.summarize(initialAnswers(null, managedChapter), managedChapter),
    ).toContain("Membership levels come from your parent organization");
  });
  it("is version 4 for parents once two-level dues exist, 3 otherwise", () => {
    expect(membershipFlow.version).toBe(4);
    expect(flowVersion(membershipFlow, { orgType: "national", twoLevelDues: true })).toBe(4);
    expect(flowVersion(membershipFlow, { orgType: "national", twoLevelDues: false })).toBe(3);
    expect(flowVersion(membershipFlow, { orgType: "chapter", twoLevelDues: true })).toBe(3);
  });
});

describe("two-level dues (v4, D-146)", () => {
  const ready = { ...national, twoLevelDues: true };
  const chapterQs = (a: Record<string, unknown>, ctx: FlowContext) =>
    visibleQuestions(
      membershipFlow.steps.find((s) => s.id === "chapters")!,
      a,
      ctx,
    ).map((q) => q.id);
  it("asks only once migration 0020 is applied", () => {
    expect(chapterQs(initialAnswers(null, national), national)).not.toContain(
      "national_dues_required",
    );
    expect(chapterQs(initialAnswers(null, ready), ready)).toEqual(
      expect.arrayContaining([
        "national_dues_required",
        "chapter_dues_required",
        "chapter_dues_min",
      ]),
    );
  });
  it("hides chapter prices when chapters use the national's levels", () => {
    const a = { ...initialAnswers(null, ready), child_levels_allowed: false };
    expect(chapterQs(a, ready)).not.toContain("chapter_dues_min");
    const plan = membershipFlow.plan(a, ready);
    expect(plan.settings).toContainEqual({
      key: "membership.chapter_dues",
      value: "none",
      mode: "locked",
    });
  });
  it("plans the rules in cents, locked", () => {
    const plan = membershipFlow.plan(
      {
        ...initialAnswers(null, ready),
        national_dues_required: true,
        chapter_dues_required: true,
        chapter_dues_min: 10,
        chapter_dues_max: 30.5,
      },
      ready,
    );
    expect(plan.settings.slice(-4)).toEqual([
      { key: "membership.national_dues_required", value: true, mode: "locked" },
      { key: "membership.chapter_dues", value: "required", mode: "locked" },
      { key: "membership.chapter_dues_min_minor", value: 1000, mode: "locked" },
      { key: "membership.chapter_dues_max_minor", value: 3050, mode: "locked" },
    ]);
    expect(
      membershipFlow.summarize(
        { ...initialAnswers(null, ready), chapter_dues_min: 10, chapter_dues_max: null },
        ready,
      ),
    ).toContain("Chapter prices: at least $10.00, no maximum");
  });
  it("refuses a minimum above the maximum", () => {
    expect(
      membershipFlow.validate!(
        { ...initialAnswers(null, ready), chapter_dues_min: 50, chapter_dues_max: 20 },
        ready,
      ),
    ).toMatch(/above the highest/);
    expect(membershipFlow.validate!(initialAnswers(null, ready), ready)).toBeNull();
  });
});

describe("chapter acceptance (D-130)", () => {
  const managed = (parentApproval: "auto" | "review") => ({ ...chapter, parentApproval });
  it("hides the chapter's own approval question when the parent decides", () => {
    const joining = membershipFlow.steps.find((s) => s.id === "joining")!;
    const ids = (ctx: typeof chapter) =>
      visibleQuestions(joining, initialAnswers(null, ctx), ctx).map((q) => q.id);
    expect(ids(chapter)).toContain("approval_required");
    expect(ids(managed("auto"))).not.toContain("approval_required");
  });
  it("never writes approval_required when the parent decides, and says who decided", () => {
    const ctx = managed("review");
    const a = pruneAnswers(
      membershipFlow,
      { ...initialAnswers(null, ctx), approval_required: false },
      ctx,
    );
    expect(a).not.toHaveProperty("approval_required");
    const plan = membershipFlow.plan(a, ctx);
    expect(plan.settings.map((s) => s.key)).not.toContain("membership.approval_required");
    expect(membershipFlow.summarize(a, ctx)).toContain(
      "New members are reviewed by an admin (set by your parent organization)",
    );
  });
  it("keeps the meaning of answers saved before v3", () => {
    expect(
      initialAnswers({ lock_joining: true, approval_required: true }, national)[
        "chapter_acceptance"
      ],
    ).toBe("review");
    expect(
      initialAnswers({ lock_joining: true, approval_required: false }, national)[
        "chapter_acceptance"
      ],
    ).toBe("auto");
    expect(initialAnswers({ lock_joining: false }, national)["chapter_acceptance"]).toBe("chapter");
    expect(
      initialAnswers({ lock_joining: true, chapter_acceptance: "chapter" }, national)[
        "chapter_acceptance"
      ],
    ).toBe("chapter");
  });
  it("validates the 3-way choice", () => {
    const step = membershipFlow.steps.find((s) => s.id === "chapters")!;
    expect(validateStep(step, { chapter_acceptance: "sometimes" }, national)).toHaveProperty(
      "chapter_acceptance",
    );
    expect(validateStep(step, { chapter_acceptance: "auto" }, national)).toEqual({});
  });
});
