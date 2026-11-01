import { describe, expect, it } from "vitest";
import {
  effectiveApprovalRequired,
  resolveFromAncestors,
  resolveSetting,
  settingsFor,
  type SettingRow,
} from "./index";

const lineage = ["national", "chapter"];
const row = (org_id: string, value: unknown, mode: SettingRow["mode"]): SettingRow => ({
  org_id,
  key: "k",
  value,
  mode,
});

describe("resolveSetting (inherit / override / locked)", () => {
  it("uses the default when nobody set the key", () => {
    expect(resolveSetting(lineage, [], "k", true).value).toBe(true);
  });
  it("a chapter inherits the national value", () => {
    const r = resolveSetting(lineage, [row("national", false, "override")], "k", true);
    expect(r).toEqual({ value: false, sourceOrgId: "national", lockedBy: null });
  });
  it("a chapter override beats an unlocked national value", () => {
    const r = resolveSetting(
      lineage,
      [row("national", false, "override"), row("chapter", true, "override")],
      "k",
      true,
    );
    expect(r.value).toBe(true);
    expect(r.sourceOrgId).toBe("chapter");
  });
  it("a national lock beats a chapter override", () => {
    const r = resolveSetting(
      lineage,
      [row("national", false, "locked"), row("chapter", true, "override")],
      "k",
      true,
    );
    expect(r).toEqual({ value: false, sourceOrgId: "national", lockedBy: "national" });
  });
  it("an org's own lock does not lock itself", () => {
    const r = resolveSetting(["national"], [row("national", false, "locked")], "k", true);
    expect(r.lockedBy).toBeNull();
    expect(r.value).toBe(false);
  });
  it("a chapter row in inherit mode defers to the parent", () => {
    const r = resolveSetting(
      lineage,
      [row("national", "a", "override"), row("chapter", "b", "inherit")],
      "k",
      "",
    );
    expect(r.value).toBe("a");
  });
});

describe("resolveFromAncestors", () => {
  const three = ["national", "region", "chapter"];
  it("ignores the org's own value", () => {
    expect(resolveFromAncestors(three, [row("chapter", true, "override")], "k", "d")).toBe("d");
  });
  it("uses the nearest ancestor, but a locked one higher up wins", () => {
    const rows = [row("national", false, "override"), row("region", true, "override")];
    expect(resolveFromAncestors(three, rows, "k", null)).toBe(true);
    const locked = [row("national", false, "locked"), row("region", true, "override")];
    expect(resolveFromAncestors(three, locked, "k", null)).toBe(false);
  });
  it("top-level orgs have no ancestors", () => {
    expect(resolveFromAncestors(["national"], [row("national", false, "locked")], "k", true)).toBe(
      true,
    );
  });
});

describe("settingsFor", () => {
  it("shows rules for sub-orgs only to nationals and regions", () => {
    const keys = (t: string) => settingsFor(t).map((s) => s.key);
    expect(keys("national")).toContain("membership.child_levels_allowed");
    expect(keys("region")).toContain("membership.child_levels_allowed");
    expect(keys("chapter")).not.toContain("membership.child_levels_allowed");
    expect(keys("standalone")).not.toContain("membership.child_levels_allowed");
  });
});

describe("effectiveApprovalRequired (D-130)", () => {
  const set = (
    org_id: string,
    key: string,
    value: unknown,
    mode: SettingRow["mode"] = "override",
  ) => ({
    org_id,
    key,
    value,
    mode,
  });
  const lineage = ["national", "region", "chapter"];
  it("uses the org's own choice when no parent decides", () => {
    expect(
      effectiveApprovalRequired(lineage, [set("chapter", "membership.approval_required", true)]),
    ).toEqual({
      required: true,
      decidedBy: null,
    });
    expect(effectiveApprovalRequired(lineage, [])).toEqual({ required: false, decidedBy: null });
  });
  it("a parent's auto or review rule wins over the chapter's own choice", () => {
    const rows = [
      set("national", "membership.child_approval", "auto", "locked"),
      set("chapter", "membership.approval_required", true),
    ];
    expect(effectiveApprovalRequired(lineage, rows)).toEqual({
      required: false,
      decidedBy: "national",
    });
    const review = [set("region", "membership.child_approval", "review", "locked")];
    expect(effectiveApprovalRequired(lineage, review)).toEqual({
      required: true,
      decidedBy: "region",
    });
  });
  it("'each chapter decides' leaves it to the chapter, and a chapter can't decide for itself", () => {
    const rows = [
      set("national", "membership.child_approval", "chapter", "locked"),
      set("chapter", "membership.child_approval", "auto", "override"),
      set("chapter", "membership.approval_required", true),
    ];
    expect(effectiveApprovalRequired(lineage, rows)).toEqual({ required: true, decidedBy: null });
  });
  it("without a rule, a chapter inherits the national's choice until it sets its own", () => {
    const rows = [set("national", "membership.approval_required", true)];
    expect(effectiveApprovalRequired(["national", "chapter"], rows).required).toBe(true);
    const own = [...rows, set("chapter", "membership.approval_required", false)];
    expect(effectiveApprovalRequired(["national", "chapter"], own).required).toBe(false);
  });
});
