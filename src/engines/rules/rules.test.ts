import { describe, expect, it } from "vitest";
import {
  describeConditions,
  opsFor,
  priceFor,
  pricingRuleInputSchema,
  type PricingRule,
  type RuleAttribute,
} from "./index";

// Same attributes, rules and cases as db/tests/9G_pricing_rules.sql
const RANK = "44444444-0000-4000-8000-000000000071";
const VET = "44444444-0000-4000-8000-000000000072";
const STATE = "44444444-0000-4000-8000-000000000073";
const YEARS = "44444444-0000-4000-8000-000000000074";
const SINCE = "44444444-0000-4000-8000-000000000075";
const attrs = new Map<string, RuleAttribute>(
  [
    {
      id: RANK,
      label: "Rank",
      data_type: "ordered",
      options: [1, 2, 3, 4, 5].map((n) => ({
        value: `E${n}`,
        label: `E-${n}`,
        sort_order: n * 10,
      })),
    },
    { id: VET, label: "Veteran", data_type: "boolean", options: [] },
    {
      id: STATE,
      label: "State",
      data_type: "choice",
      options: [
        { value: "TX", label: "Texas", sort_order: 10 },
        { value: "OK", label: "Oklahoma", sort_order: 20 },
        { value: "NM", label: "New Mexico", sort_order: 30 },
      ],
    },
    { id: YEARS, label: "Years", data_type: "number", options: [] },
    { id: SINCE, label: "Since", data_type: "date", options: [] },
  ].map((a) => [a.id, a]),
);
const rule = (over: Partial<PricingRule>): PricingRule => ({
  id: "r",
  term_id: "t",
  label: "",
  conditions: [],
  price_minor: null,
  discount_pct: null,
  sort_order: 0,
  active: true,
  ...over,
});
const rules: PricingRule[] = [
  rule({ id: "everyone", sort_order: 40, price_minor: 100, active: false }),
  rule({
    id: "veteran",
    sort_order: 20,
    discount_pct: 20,
    conditions: [{ attribute_id: VET, op: "is", value: true }],
  }),
  rule({
    id: "senior",
    sort_order: 10,
    price_minor: 3000,
    conditions: [{ attribute_id: RANK, op: "at_least", value: "E4" }],
  }),
  rule({
    id: "region",
    sort_order: 30,
    price_minor: 1000,
    conditions: [
      { attribute_id: STATE, op: "in", values: ["TX", "OK"] },
      { attribute_id: YEARS, op: "at_least", value: 10 },
      { attribute_id: SINCE, op: "at_most", value: "2000-01-01" },
    ],
  }),
];
const cases: [string, Record<string, unknown>, number][] = [
  ["rank E-5 → senior price", { [RANK]: "E5" }, 3000],
  ["rank E-4 counts as at least E-4", { [RANK]: "E4" }, 3000],
  ["rank E-2 veteran → 20% off", { [RANK]: "E2", [VET]: true }, 4000],
  ["rank E-4 veteran → first rule wins", { [RANK]: "E4", [VET]: true }, 3000],
  ["rank E-2 → base price", { [RANK]: "E2" }, 5000],
  ["no answers → base price (retired rule ignored)", {}, 5000],
  ["all conditions hold", { [STATE]: "OK", [YEARS]: 12, [SINCE]: "1999-05-01" }, 1000],
  ["one condition fails", { [STATE]: "NM", [YEARS]: 12, [SINCE]: "1999-05-01" }, 5000],
  ["unknown rank value", { [RANK]: "E9" }, 5000],
];

describe("priceFor (same cases as the database)", () => {
  it.each(cases)("%s", (_name, values, want) => {
    expect(priceFor(5000, rules, attrs, values).price).toBe(want);
  });
  it("reports which rule applied", () => {
    expect(priceFor(5000, rules, attrs, { [VET]: true }).rule?.id).toBe("veteran");
    expect(priceFor(5000, rules, attrs, {}).rule).toBeNull();
  });
  it("multi-choice answers match is / one of", () => {
    const multi = new Map(attrs).set("m", {
      id: "m",
      label: "Roles",
      data_type: "multi_choice",
      options: [],
    });
    const r = [
      rule({ price_minor: 1, conditions: [{ attribute_id: "m", op: "in", values: ["a", "b"] }] }),
    ];
    expect(priceFor(9, r, multi, { m: ["c", "b"] }).price).toBe(1);
    expect(priceFor(9, r, multi, { m: ["c"] }).price).toBe(9);
  });
  it("rounds discounts like the database", () => {
    expect(priceFor(2499, [rule({ discount_pct: 50 })], attrs, {}).price).toBe(1250);
  });
});

describe("rule helpers", () => {
  it("offers comparisons that fit the field type", () => {
    expect(opsFor("ordered")).toEqual(["is", "in", "at_least", "at_most"]);
    expect(opsFor("boolean")).toEqual(["is"]);
    expect(opsFor("number")).not.toContain("in");
  });
  it("describes conditions in plain words", () => {
    expect(describeConditions(rules[3]!.conditions, attrs)).toBe(
      "State is one of Texas, Oklahoma and Years is at least 10 and Since is at most 2000-01-01",
    );
    expect(describeConditions([{ attribute_id: VET, op: "is", value: true }], attrs)).toBe(
      "Veteran is yes",
    );
    expect(describeConditions([], attrs)).toBe("Everyone");
  });
  it("validates rule input", () => {
    const ok = { label: "", conditions: [], price_minor: 100, discount_pct: null, sort_order: 0 };
    expect(pricingRuleInputSchema.safeParse(ok).success).toBe(true);
    expect(pricingRuleInputSchema.safeParse({ ...ok, discount_pct: 10 }).success).toBe(false);
    expect(
      pricingRuleInputSchema.safeParse({
        ...ok,
        conditions: [{ attribute_id: RANK, op: "in", values: [] }],
      }).success,
    ).toBe(false);
  });
});
