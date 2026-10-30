import { describe, expect, it } from "vitest";
import { diffByKey, pruneAnswers, validateStep, visibleSteps, type Step } from "./index";
import { initialAnswers, membershipFlow } from "@/modules/membership/setup-flow";
import { STARTER_ATTRIBUTES } from "@/engines/attributes";

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
  it("a national that locks joining rules locks both settings and the logo rule", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, national), lock_joining: true, chapter_logo_allowed: false },
      national,
    );
    expect(plan.settings).toEqual([
      { key: "membership.approval_required", value: false, mode: "locked" },
      { key: "membership.grace_days", value: 30, mode: "locked" },
      { key: "branding.chapter_logo_allowed", value: false, mode: "locked" },
    ]);
  });
  it("a standalone org never locks and has no chapter settings", () => {
    const plan = membershipFlow.plan(
      { ...initialAnswers(null, standalone), lock_joining: true },
      standalone,
    );
    expect(plan.settings.every((s) => s.mode === "override")).toBe(true);
    expect(plan.settings.map((s) => s.key)).not.toContain("branding.chapter_logo_allowed");
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
  it("summary describes grace days and chapter rules in plain language", () => {
    const lines = membershipFlow.summarize(
      { ...initialAnswers(null, national), grace_days: 15, lock_joining: true },
      national,
    );
    expect(lines).toContain("Grace period: 15 days");
    expect(lines).toContain("Chapters must use these joining rules");
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
