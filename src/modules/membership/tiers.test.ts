import { describe, expect, it } from "vitest";
import {
  describeTier,
  formatPrice,
  newTerm,
  parsePrice,
  priceInput,
  termEndDate,
  termKey,
  termLabel,
  TERM_LENGTH_CHOICES,
  tierInputSchema,
  tierKey,
  withLength,
} from "./tiers";

describe("prices", () => {
  it("parses dollars into cents", () => {
    expect(parsePrice("25")).toBe(2500);
    expect(parsePrice("25.5")).toBe(2550);
    expect(parsePrice(" $1,250.05 ")).toBe(125005);
    expect(parsePrice("0")).toBe(0);
  });
  it("rejects anything that isn't a price", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12345678"])
      expect(parsePrice(bad)).toBeNull();
  });
  it("formats cents", () => {
    expect(formatPrice(2550)).toBe("$25.50");
    expect(priceInput(30000)).toBe("300.00");
  });
});

describe("term lengths", () => {
  it("labels with singular and plural units", () => {
    expect(termLabel({ count: 1, unit: "year" })).toBe("1 year");
    expect(termLabel({ count: 18, unit: "month" })).toBe("18 months");
    expect(termLabel({ count: 90, unit: "day" })).toBe("90 days");
    expect(termLabel(null)).toBe("Lifetime");
  });
  it("derives keys", () => {
    expect(termKey({ count: 3, unit: "year" })).toBe("3_year");
    expect(termKey(null)).toBe("lifetime");
    expect(tierKey("Regular Member!")).toBe("regular_member");
    expect(tierKey("2026 Founders")).toBe("t_2026_founders");
  });
  it("keeps a saved term's key when its length changes", () => {
    const saved = { ...newTerm(), id: "x" };
    expect(withLength(saved, null)).toMatchObject({ key: "1_year", label: "Lifetime" });
    expect(withLength(newTerm(), { count: 6, unit: "month" })).toMatchObject({
      key: "6_month",
      length_count: 6,
      length_unit: "month",
    });
  });
});

describe("length drop-down", () => {
  it("offers Days, Months, Years and Lifetime", () => {
    expect(TERM_LENGTH_CHOICES.map((c) => c.label)).toEqual([
      "Days",
      "Months",
      "Years",
      "Lifetime",
    ]);
  });
});

describe("termEndDate", () => {
  it("runs through the day before the anniversary", () => {
    expect(termEndDate("2026-03-15", { count: 1, unit: "year" })).toBe("2027-03-14");
    expect(termEndDate("2026-01-01", { count: 3, unit: "month" })).toBe("2026-03-31");
    expect(termEndDate("2026-01-01", { count: 30, unit: "day" })).toBe("2026-01-30");
    expect(termEndDate("2026-12-20", { count: 20, unit: "day" })).toBe("2027-01-08");
  });
  it("handles month ends and leap years", () => {
    expect(termEndDate("2026-01-31", { count: 1, unit: "month" })).toBe("2026-02-28");
    expect(termEndDate("2028-01-31", { count: 1, unit: "month" })).toBe("2028-02-29");
    expect(termEndDate("2028-02-29", { count: 1, unit: "year" })).toBe("2029-02-28");
    expect(termEndDate("2027-03-01", { count: 1, unit: "year" })).toBe("2028-02-29");
  });
  it("lifetime never ends", () => {
    expect(termEndDate("2026-01-01", null)).toBeNull();
  });
});

describe("tierInputSchema", () => {
  const tier = {
    key: "regular",
    name: "Regular",
    description: "",
    tax_treatment: "non_deductible" as const,
    terms: [newTerm()],
  };
  it("accepts a level with terms", () => {
    expect(tierInputSchema.safeParse(tier).success).toBe(true);
  });
  it("needs at least one term, each length once", () => {
    expect(tierInputSchema.safeParse({ ...tier, terms: [] }).success).toBe(false);
    expect(tierInputSchema.safeParse({ ...tier, terms: [newTerm(), newTerm()] }).success).toBe(
      false,
    );
  });
  it("requires a count with a unit, or neither (lifetime)", () => {
    const t = newTerm();
    expect(
      tierInputSchema.safeParse({ ...tier, terms: [{ ...t, length_unit: null }] }).success,
    ).toBe(false);
    expect(
      tierInputSchema.safeParse({
        ...tier,
        terms: [{ ...t, key: "lifetime", length_count: null, length_unit: null }],
      }).success,
    ).toBe(true);
  });
  it("rejects negative prices", () => {
    expect(
      tierInputSchema.safeParse({ ...tier, terms: [{ ...newTerm(), price_minor: -1 }] }).success,
    ).toBe(false);
  });
});

describe("describeTier", () => {
  it("summarizes active terms", () => {
    expect(
      describeTier({
        name: "Regular",
        terms: [
          { ...newTerm(), price_minor: 2500 },
          { ...withLength(newTerm(), null), price_minor: 30000 },
          { ...withLength(newTerm(), { count: 2, unit: "year" }), active: false },
        ],
      }),
    ).toBe("Regular: 1 year $25.00, Lifetime $300.00");
  });
});
