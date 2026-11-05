import { describe, expect, it } from "vitest";
import { membershipSummary } from "./summary";

const row = (key: string, value: unknown) => ({
  org_id: "n",
  key,
  value,
  mode: "override" as const,
});

describe("membershipSummary (D-203)", () => {
  it("describes a home-chapter national without chapter levels or dues", () => {
    const lines = membershipSummary({
      orgId: "n",
      orgType: "national",
      model: "home_chapter",
      settings: [row("membership.grace_days", 45), row("membership.at_large_chapter", "c1")],
      nameOf: (id) => (id === "c1" ? "Online Chapter" : undefined),
    });
    expect(lines[0]).toMatch(/with a home chapter/);
    expect(lines).toContain("New members are accepted as soon as they've paid.");
    expect(lines).toContain("Members keep their standing for 45 days after their membership ends.");
    expect(lines).toContain("Members without a local chapter are offered Online Chapter.");
    expect(lines.join(" ")).not.toMatch(/Chapter prices|sell their own|two payments/);
  });

  it("describes a separate-model national's rules for chapters", () => {
    const lines = membershipSummary({
      orgId: "n",
      orgType: "national",
      model: "separate",
      settings: [
        row("membership.approval_required", true),
        row("membership.chapter_dues", "optional"),
        row("membership.chapter_dues_min_minor", 1000),
        row("membership.national_dues_required", true),
        row("membership.child_approval", "review"),
      ],
      nameOf: () => undefined,
    });
    expect(lines).toEqual([
      "Separate memberships: this organization and each chapter have their own members and standing; people join here at the levels below.",
      "New members wait for an admin's approval.",
      "Members keep their standing for 30 days after their membership ends.",
      "Chapters may sell their own memberships too (each chapter may choose).",
      "Chapter prices: at least $10.00, no maximum.",
      "Chapter members also need a membership here: two payments when they join a chapter.",
      "New chapter members are always reviewed by an admin.",
    ]);
  });

  it("keeps a standalone organization to its own joining rules", () => {
    const lines = membershipSummary({
      orgId: "s",
      orgType: "standalone",
      model: "separate",
      settings: [],
      nameOf: () => undefined,
    });
    expect(lines).toEqual([
      "New members are accepted as soon as they've paid.",
      "Members keep their standing for 30 days after their membership ends.",
    ]);
  });
});
