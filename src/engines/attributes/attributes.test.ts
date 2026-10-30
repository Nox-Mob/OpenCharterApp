import { describe, expect, it } from "vitest";
import {
  attributeInputSchema,
  coerceInput,
  compareOrdered,
  moveOption,
  STARTER_ATTRIBUTES,
  toKey,
  validateValue,
} from "./index";

const def = (data_type: Parameters<typeof validateValue>[0]["data_type"], required = false) => ({
  data_type,
  required,
  label: "Field",
});
const options = [
  { value: "E1", label: "E-1", sort_order: 1, active: true },
  { value: "E2", label: "E-2", sort_order: 2, active: true },
  { value: "E3", label: "E-3", sort_order: 3, active: false },
];

describe("validateValue", () => {
  it("empty is fine unless required", () => {
    expect(validateValue(def("text"), [], "")).toBeNull();
    expect(validateValue(def("text", true), [], "")).toBe("Field is required");
    expect(validateValue(def("multi_choice", true), options, [])).toBe("Field is required");
  });
  it("text must be a string up to 2000 chars", () => {
    expect(validateValue(def("text"), [], "hi")).toBeNull();
    expect(validateValue(def("text"), [], "x".repeat(2001))).not.toBeNull();
    expect(validateValue(def("text"), [], 5)).not.toBeNull();
  });
  it("number must be finite", () => {
    expect(validateValue(def("number"), [], 3.5)).toBeNull();
    expect(validateValue(def("number"), [], "3")).not.toBeNull();
    expect(validateValue(def("number"), [], Number.NaN)).not.toBeNull();
  });
  it("date must be a real YYYY-MM-DD date", () => {
    expect(validateValue(def("date"), [], "2024-02-29")).toBeNull();
    expect(validateValue(def("date"), [], "2023-02-29")).not.toBeNull();
    expect(validateValue(def("date"), [], "May 1")).not.toBeNull();
  });
  it("boolean must be true/false", () => {
    expect(validateValue(def("boolean"), [], false)).toBeNull();
    expect(validateValue(def("boolean"), [], "yes")).not.toBeNull();
  });
  it("choice and ordered accept only active options", () => {
    expect(validateValue(def("choice"), options, "E1")).toBeNull();
    expect(validateValue(def("ordered"), options, "E3")).not.toBeNull();
    expect(validateValue(def("ordered"), options, "E9")).not.toBeNull();
  });
  it("multi choice rejects duplicates and unknown values", () => {
    expect(validateValue(def("multi_choice"), options, ["E1", "E2"])).toBeNull();
    expect(validateValue(def("multi_choice"), options, ["E1", "E1"])).not.toBeNull();
    expect(validateValue(def("multi_choice"), options, ["E1", "nope"])).not.toBeNull();
  });
});

describe("helpers", () => {
  it("toKey makes a safe key", () => {
    expect(toKey("Join Date")).toBe("join_date");
    expect(toKey("2nd Branch!")).toBe("f_2nd_branch");
  });
  it("compareOrdered follows option order", () => {
    expect(compareOrdered(options, "E2", "E1")).toBeGreaterThan(0);
    expect(compareOrdered(options, "E1", "E2")).toBeLessThan(0);
  });
  it("moveOption swaps neighbours and ignores out-of-range moves", () => {
    expect(moveOption(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveOption(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
  it("coerceInput turns numeric text into numbers and blanks into null", () => {
    expect(coerceInput("number", "42")).toBe(42);
    expect(coerceInput("text", "")).toBeNull();
  });
});

describe("attributeInputSchema", () => {
  const base = {
    label: "Rank",
    key: "rank",
    data_type: "ordered" as const,
    required: false,
    visibility: "members" as const,
    member_editable: false,
    show_in_directory: true,
  };
  it("choice-like types need at least two choices", () => {
    expect(
      attributeInputSchema.safeParse({ ...base, options: [{ value: "E1", label: "E1" }] }).success,
    ).toBe(false);
  });
  it("choices must be unique", () => {
    expect(
      attributeInputSchema.safeParse({
        ...base,
        options: [
          { value: "a", label: "a" },
          { value: "a", label: "b" },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects keys the database would reject", () => {
    expect(
      attributeInputSchema.safeParse({ ...base, key: "Bad Key", options: [], data_type: "text" })
        .success,
    ).toBe(false);
  });
  it("every starter attribute is valid", () => {
    for (const s of STARTER_ATTRIBUTES)
      expect(attributeInputSchema.safeParse(s).success).toBe(true);
  });
});
