import { describe, expect, it } from "vitest";
import {
  LEGAL_EFFECTIVE,
  LEGAL_OPERATOR,
  LEGAL_PLACEHOLDER,
  LEGAL_UPDATED,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
} from "./legal";

describe("privacy policy and terms (D-210)", () => {
  it("names the operator and dates, with the placeholder banner off", () => {
    expect(LEGAL_OPERATOR).toBe("OpenAppHub");
    expect(LEGAL_EFFECTIVE).not.toMatch(/\[/);
    expect(LEGAL_UPDATED).not.toMatch(/\[/);
    expect(LEGAL_PLACEHOLDER).toBe(false);
  });

  it("has every section of the supplied text, each named once", () => {
    expect(TERMS_SECTIONS).toHaveLength(22);
    expect(PRIVACY_SECTIONS).toHaveLength(19);
    for (const list of [TERMS_SECTIONS, PRIVACY_SECTIONS]) {
      expect(new Set(list.map((s) => s.heading)).size).toBe(list.length);
    }
    expect(TERMS_SECTIONS[19]?.heading).toBe("Governing Law and Jurisdiction");
    expect(PRIVACY_SECTIONS[2]?.heading).toBe("Information We Collect");
  });
});
