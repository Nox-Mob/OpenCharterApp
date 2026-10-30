import { describe, expect, it } from "vitest";
import { resolveSetting, type SettingRow } from "./index";

const lineage = ["national", "chapter"];
const row = (org_id: string, value: unknown, mode: SettingRow["mode"]): SettingRow => ({ org_id, key: "k", value, mode });

describe("resolveSetting (inherit / override / locked)", () => {
  it("uses the default when nobody set the key", () => {
    expect(resolveSetting(lineage, [], "k", true).value).toBe(true);
  });
  it("a chapter inherits the national value", () => {
    const r = resolveSetting(lineage, [row("national", false, "override")], "k", true);
    expect(r).toEqual({ value: false, sourceOrgId: "national", lockedBy: null });
  });
  it("a chapter override beats an unlocked national value", () => {
    const r = resolveSetting(lineage, [row("national", false, "override"), row("chapter", true, "override")], "k", true);
    expect(r.value).toBe(true);
    expect(r.sourceOrgId).toBe("chapter");
  });
  it("a national lock beats a chapter override", () => {
    const r = resolveSetting(lineage, [row("national", false, "locked"), row("chapter", true, "override")], "k", true);
    expect(r).toEqual({ value: false, sourceOrgId: "national", lockedBy: "national" });
  });
  it("an org's own lock does not lock itself", () => {
    const r = resolveSetting(["national"], [row("national", false, "locked")], "k", true);
    expect(r.lockedBy).toBeNull();
    expect(r.value).toBe(false);
  });
  it("a chapter row in inherit mode defers to the parent", () => {
    const r = resolveSetting(lineage, [row("national", "a", "override"), row("chapter", "b", "inherit")], "k", "");
    expect(r.value).toBe("a");
  });
});
