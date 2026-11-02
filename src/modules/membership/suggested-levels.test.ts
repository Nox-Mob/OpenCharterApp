import { describe, expect, it } from "vitest";
import { describePriceRule, linkErrorMessage, linkedPrice } from "./suggested-levels";

describe("suggested levels (A4)", () => {
  // the same cases as db/tests/9M_levels_standing_pricing.sql (public.linked_price)
  it("prices a linked term: same, amount off, percentage off, never below zero", () => {
    expect(linkedPrice(5000, "same", 0)).toBe(5000);
    expect(linkedPrice(5000, "minus_percent", 20)).toBe(4000);
    expect(linkedPrice(30000, "minus_percent", 20)).toBe(24000);
    expect(linkedPrice(6000, "minus_amount", 1000)).toBe(5000);
    expect(linkedPrice(500, "minus_amount", 1000)).toBe(0);
    expect(linkedPrice(999, "minus_percent", 33)).toBe(669);
    expect(linkedPrice(1000, "minus_percent", 150)).toBe(0);
  });

  it("keeps prices within the national's range", () => {
    expect(linkedPrice(30000, "same", 0, { min: null, max: 20000 })).toBe(20000);
    expect(linkedPrice(500, "same", 0, { min: 1000, max: null })).toBe(1000);
  });

  it("describes the rule in words", () => {
    expect(describePriceRule("minus_percent", 20, "Nat")).toBe("20% less than Nat's");
    expect(describePriceRule("minus_amount", 500, "Nat")).toBe("$5.00 less than Nat's");
    expect(describePriceRule("same", null, "Nat")).toBe("Same price as Nat's");
    expect(
      linkErrorMessage("this level follows your national's; make it your own to change it"),
    ).toMatch(/Make it your own/);
  });
});
