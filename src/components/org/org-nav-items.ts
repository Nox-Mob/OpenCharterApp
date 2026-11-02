/**
 * Left-hand navigation of an organization page (D-152). The main sections are Overview, Members,
 * Directory, Board, Reports, Chapters and Settings; everything an admin configures sits under
 * Settings. Each item is shown only when the viewer may use it (the flags come from the policy
 * layer in the route), and a section the viewer can't see falls back to Overview.
 */
export type OrgNavFlags = {
  canSeeMembers: boolean;
  canSeeReports: boolean;
  hasChapters: boolean;
  isChapter: boolean;
  canManage: boolean;
  canRunSetup: boolean;
  canManageLevels: boolean;
  canManageFields: boolean;
  canManageRoles: boolean;
  canSeePayments: boolean;
  canAudit: boolean;
};

export type NavItem = { value: string; label: string };
export type OrgNav = { main: NavItem[]; settings: NavItem[] };

export function buildOrgNav(f: OrgNavFlags): OrgNav {
  const settings: NavItem[] = [
    f.canManage && { value: "settings", label: "General" },
    f.canRunSetup && { value: "setup", label: "Setup" },
    f.canManageLevels && { value: "levels", label: "Membership levels" },
    f.canManageFields && { value: "fields", label: "Member fields" },
    (f.hasChapters || f.isChapter) &&
      (f.canManageFields || f.canManage) && { value: "chapter-fields", label: "Chapter fields" },
    f.canManageRoles && { value: "roles", label: "Roles" },
    f.canSeePayments && { value: "payments", label: "Payments" },
    f.canAudit && { value: "audit", label: "Audit log" },
  ].filter((x): x is NavItem => !!x);
  const main: NavItem[] = [
    { value: "overview", label: "Overview" },
    f.canSeeMembers && { value: "members", label: "Members" },
    // Admins have the Members page (everyone, with contact details), so no Directory (D-154).
    !f.canSeeMembers && { value: "directory", label: "Directory" },
    { value: "board", label: "Board" },
    f.canSeeReports && { value: "reports", label: "Reports" },
    f.hasChapters && { value: "chapters", label: "Chapters" },
  ].filter((x): x is NavItem => !!x);
  if (settings.length) main.push({ value: settings[0]!.value, label: "Settings" });
  return { main, settings };
}

/** The section to show: the one asked for if the viewer can see it, else Overview. */
export function resolveSection(nav: OrgNav, asked: string): string {
  return [...nav.main, ...nav.settings].some((i) => i.value === asked) ? asked : "overview";
}

export function isSettingsSection(nav: OrgNav, value: string) {
  return nav.settings.some((i) => i.value === value);
}
