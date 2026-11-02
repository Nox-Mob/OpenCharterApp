import { describe, expect, it } from "vitest";
import { visibleSteps } from "@/engines/setup";
import { membershipFlow, pricingPlan, type PricingRuleAnswer } from "./setup-flow";

const tiers = [
  {
    key: "reg",
    name: "Regular",
    description: "",
    tax_treatment: "non_deductible" as const,
    terms: [
      {
        key: "1y",
        label: "1 year",
        length_count: 1,
        length_unit: "year" as const,
        price_minor: 5000,
        currency: "USD",
      },
      {
        key: "old",
        label: "Old",
        length_count: 2,
        length_unit: "year" as const,
        price_minor: 9000,
        currency: "USD",
        active: false,
      },
    ],
  },
];
const rule = (over: Partial<PricingRuleAnswer>): PricingRuleAnswer => ({
  tier_key: "reg",
  term_key: "1y",
  label: "Veterans",
  conditions: [],
  price_minor: null,
  discount_pct: 20,
  ...over,
});
const ctx = { orgType: "national", orgName: "Nat", setupPricing: true };

describe("Membership setup: pricing step (A6)", () => {
  it("appears only once migration 0032 is applied and the org owns its levels", () => {
    const ids = (c: object) =>
      visibleSteps(membershipFlow, membershipFlow.defaults(c as never), c as never).map(
        (s) => s.id,
      );
    expect(ids(ctx)).toContain("pricing");
    expect(ids({ ...ctx, setupPricing: false })).not.toContain("pricing");
    expect(ids({ ...ctx, childLevelsAllowed: false })).not.toContain("pricing");
  });

  it("plans rules for terms still in the setup, numbered per term, named", () => {
    const plan = pricingPlan(
      [
        rule({}),
        rule({ label: " Life " }),
        rule({ term_key: "old" }),
        rule({ tier_key: "gone" }),
        rule({ label: "  " }),
      ],
      { tiers },
    );
    expect(plan.map((r) => `${r.term_key}:${r.label}:${r.sort_order}`)).toEqual([
      "1y:Veterans:1",
      "1y:Life:2",
    ]);
  });

  it("puts pricing rules in the plan and the summary", () => {
    const a = { ...membershipFlow.defaults(ctx as never), tiers, pricing_rules: [rule({})] };
    expect(membershipFlow.plan(a, ctx as never).pricing_rules).toHaveLength(1);
    expect(membershipFlow.summarize(a, ctx as never)).toContain("1 pricing rule by member fields");
    expect(
      membershipFlow.plan(a, { ...ctx, setupPricing: false } as never).pricing_rules,
    ).toBeUndefined();
  });
});
