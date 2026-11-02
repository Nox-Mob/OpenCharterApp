import { describe, expect, it } from "vitest";
import { buildOrgNav, isSettingsSection, resolveSection, type OrgNavFlags } from "./org-nav-items";

const none: OrgNavFlags = {
  canSeeMembers: false,
  canSeeReports: false,
  hasChapters: false,
  isChapter: false,
  canManage: false,
  canRunSetup: false,
  canManageLevels: false,
  canManageFields: false,
  canManageRoles: false,
  canConfigureBoard: false,
  canSeePayments: false,
  canAudit: false,
};
const admin: OrgNavFlags = {
  ...none,
  canSeeMembers: true,
  canSeeReports: true,
  canManage: true,
  canRunSetup: true,
  canManageLevels: true,
  canManageFields: true,
  canManageRoles: true,
  canConfigureBoard: true,
  canSeePayments: true,
  canAudit: true,
};
const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("organization navigation", () => {
  it("puts the main sections first and everything else under Settings", () => {
    const nav = buildOrgNav({ ...admin, hasChapters: true });
    // admins get Members (everyone, with contact details) instead of Directory
    expect(labels(nav.main)).toEqual([
      "Overview",
      "Members",
      "Board",
      "Reports",
      "Chapters",
      "Settings",
    ]);
    expect(labels(nav.settings)).toEqual([
      "General",
      "Setup",
      "Membership levels",
      "Member fields",
      "Chapter fields",
      "Board settings",
      "Roles",
      "Payments",
      "Audit log",
    ]);
    // Settings opens its first page
    expect(nav.main.at(-1)?.value).toBe("settings");
  });

  it("gives a chapter admin Reports but no Chapters section", () => {
    const nav = buildOrgNav({ ...admin, isChapter: true });
    expect(labels(nav.main)).toEqual(["Overview", "Members", "Board", "Reports", "Settings"]);
    expect(labels(nav.settings)).toContain("Chapter fields");
  });

  it("shows a plain member only Overview, Directory and Board", () => {
    const nav = buildOrgNav({ ...none, isChapter: true });
    expect(labels(nav.main)).toEqual(["Overview", "Directory", "Board"]);
    expect(nav.settings).toEqual([]);
  });

  it("opens Settings on the first page the viewer may use", () => {
    const nav = buildOrgNav({ ...none, canSeePayments: true });
    expect(nav.main.at(-1)).toEqual({ value: "payments", label: "Settings" });
    expect(isSettingsSection(nav, "payments")).toBe(true);
    expect(isSettingsSection(nav, "overview")).toBe(false);
  });

  it("falls back to Overview for a section the viewer can't see", () => {
    const nav = buildOrgNav(none);
    expect(resolveSection(nav, "audit")).toBe("overview");
    expect(resolveSection(nav, "board")).toBe("board");
    expect(resolveSection(buildOrgNav(admin), "directory")).toBe("overview");
    expect(resolveSection(buildOrgNav(admin), "setup")).toBe("setup");
  });
});
