/**
 * Settings engine (E-04). Settings resolve through the org lineage with
 * inherit / override / locked modes (README principle 2):
 * - locked at an ancestor: that value wins and descendants cannot change it
 * - otherwise the nearest org (self first, then up) with a value wins
 * - otherwise the registry default applies
 */
export type SettingMode = "inherit" | "override" | "locked";
export type SettingRow = { org_id: string; key: string; value: unknown; mode: SettingMode };

export type SettingDef = {
  key: string;
  label: string;
  description: string;
  kind: "boolean" | "text" | "number" | "choice";
  default: boolean | string | number;
  /** For kind "choice". */
  options?: readonly { value: string; label: string }[];
  /** "parents": a rule a national or region sets for the orgs below it. */
  appliesTo?: "all" | "parents";
  /**
   * An ancestor's "parents" rule that can decide this setting instead (e.g. chapter
   * auto-acceptance decides approval_required). Rule values not listed leave it to the org.
   */
  decidedBy?: { key: string; values: Record<string, boolean | string | number> };
};

export const SETTINGS: readonly SettingDef[] = [
  {
    key: "branding.chapter_logo_allowed",
    label: "Chapters may use their own logo",
    description: "When off, chapters show the national logo.",
    kind: "boolean",
    default: true,
  },
  {
    key: "membership.child_levels_allowed",
    label: "Chapters may create their own membership levels",
    description:
      "When off, chapters use your membership levels and can't add their own. Enforced in the database.",
    kind: "boolean",
    default: true,
    appliesTo: "parents",
  },
  {
    key: "membership.child_approval",
    label: "How new members of your chapters are accepted",
    description:
      "Accepted automatically or always reviewed applies to every chapter. Otherwise each chapter decides.",
    kind: "choice",
    default: "chapter",
    options: [
      { value: "auto", label: "Accepted automatically" },
      { value: "review", label: "Always reviewed by an admin" },
      { value: "chapter", label: "Each chapter decides" },
    ],
    appliesTo: "parents",
  },
  {
    key: "membership.approval_required",
    label: "New members need admin approval",
    description: "When on, join requests wait for an admin before the person becomes a member.",
    kind: "boolean",
    default: false,
    decidedBy: { key: "membership.child_approval", values: { auto: false, review: true } },
  },
  {
    key: "membership.grace_days",
    label: "Grace period (days)",
    description: "How long after expiration a member keeps their standing.",
    kind: "number",
    default: 30,
  },
  {
    key: "contact.email",
    label: "Public contact email",
    description: "Shown on public pages and receipts.",
    kind: "text",
    default: "",
  },
];

/** Settings shown for an org: rules for sub-orgs only appear on orgs that have them. */
export function settingsFor(orgType: string): SettingDef[] {
  const parent = orgType === "national" || orgType === "region";
  return SETTINGS.filter((s) => (s.appliesTo ?? "all") === "all" || parent);
}

/**
 * Value of a setting as set by an org's ancestors only (mirrors public.ancestor_setting):
 * a locked ancestor wins, else the nearest ancestor with a value. The org's own row is ignored,
 * so a sub-org can't grant itself a right its parent controls.
 */
export function resolveFromAncestors(
  lineage: readonly string[],
  rows: readonly SettingRow[],
  key: string,
  fallback: unknown,
): unknown {
  return ancestorValue(lineage, rows, key, fallback).value;
}

/** resolveFromAncestors, also naming the ancestor the value came from (null = fallback). */
export function ancestorValue(
  lineage: readonly string[],
  rows: readonly SettingRow[],
  key: string,
  fallback: unknown,
): { value: unknown; sourceOrgId: string | null } {
  const ancestors = lineage.slice(0, -1);
  const byOrg = new Map(rows.filter((r) => r.key === key).map((r) => [r.org_id, r]));
  for (const id of ancestors) {
    const r = byOrg.get(id);
    if (r?.mode === "locked") return { value: r.value, sourceOrgId: id };
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const r = byOrg.get(ancestors[i]!);
    if (r && r.mode !== "inherit") return { value: r.value, sourceOrgId: r.org_id };
  }
  return { value: fallback, sourceOrgId: null };
}

/**
 * Resolve a setting, letting an ancestor's rule decide it when the definition says so
 * (`decidedBy`). A decided value reads as locked by that ancestor.
 */
export function resolveDef(
  lineage: readonly string[],
  rows: readonly SettingRow[],
  def: SettingDef,
): Resolved {
  if (def.decidedBy) {
    const rule = ancestorValue(lineage, rows, def.decidedBy.key, null);
    const decided = typeof rule.value === "string" ? def.decidedBy.values[rule.value] : undefined;
    if (decided !== undefined && rule.sourceOrgId)
      return { value: decided, sourceOrgId: rule.sourceOrgId, lockedBy: rule.sourceOrgId };
  }
  return resolveSetting(lineage, rows, def.key, def.default);
}

/** Whether an org must approve new members (E-13b): a parent's acceptance rule wins (D-130). */
export function effectiveApprovalRequired(
  lineage: readonly string[],
  rows: readonly SettingRow[],
): { required: boolean; decidedBy: string | null } {
  const def = SETTINGS.find((s) => s.key === "membership.approval_required")!;
  const rule = ancestorValue(lineage, rows, "membership.child_approval", "chapter");
  const r = resolveDef(lineage, rows, def);
  const byRule = rule.value === "auto" || rule.value === "review";
  return { required: r.value === true, decidedBy: byRule ? rule.sourceOrgId : null };
}

export type Resolved = {
  value: unknown;
  sourceOrgId: string | null;
  lockedBy: string | null;
};

/** lineage is ordered root first, self last. */
export function resolveSetting(
  lineage: readonly string[],
  rows: readonly SettingRow[],
  key: string,
  fallback: unknown,
): Resolved {
  const self = lineage[lineage.length - 1];
  const byOrg = new Map(rows.filter((r) => r.key === key).map((r) => [r.org_id, r]));
  for (const orgId of lineage) {
    const r = byOrg.get(orgId);
    if (r && r.mode === "locked" && orgId !== self)
      return { value: r.value, sourceOrgId: orgId, lockedBy: orgId };
  }
  for (let i = lineage.length - 1; i >= 0; i--) {
    const r = byOrg.get(lineage[i]!);
    if (r && r.mode !== "inherit") return { value: r.value, sourceOrgId: r.org_id, lockedBy: null };
  }
  return { value: fallback, sourceOrgId: null, lockedBy: null };
}
