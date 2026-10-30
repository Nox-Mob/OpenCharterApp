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
  kind: "boolean" | "text" | "number";
  default: boolean | string | number;
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
    key: "membership.approval_required",
    label: "New members need admin approval",
    description: "When on, join requests wait for an admin before the person becomes a member.",
    kind: "boolean",
    default: false,
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
    if (r && r.mode === "locked" && orgId !== self) return { value: r.value, sourceOrgId: orgId, lockedBy: orgId };
  }
  for (let i = lineage.length - 1; i >= 0; i--) {
    const r = byOrg.get(lineage[i]!);
    if (r && r.mode !== "inherit") return { value: r.value, sourceOrgId: r.org_id, lockedBy: null };
  }
  return { value: fallback, sourceOrgId: null, lockedBy: null };
}
