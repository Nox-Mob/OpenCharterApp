import { describe, expect, it } from "vitest";
import { resolveFromAncestors, resolveSetting, settingsFor, type SettingRow } from "./index";

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
