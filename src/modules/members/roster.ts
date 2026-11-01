import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import type { AttributeOption, AttributeType, Visibility } from "@/engines/attributes";
import type { MemberRow } from "@/modules/membership/memberships";
import { daysToExpiration, standing, type Standing } from "@/modules/membership/standing";

/**
 * Member list tools (E-14): search, filters, sorting and CSV export, all on data the viewer
 * can already read (RLS). Exports include only fields the exporter may see and are audited
 * through log_member_export (migration 0011).
 */
export type RosterField = {
  id: string;
  label: string;
  data_type: AttributeType;
  visibility: Visibility;
  options: Pick<AttributeOption, "value" | "label" | "sort_order" | "active">[];
};

export type RosterRow = MemberRow & {
  values: Record<string, unknown>;
  standing: Standing;
  /** Days until paid-through (negative once past); null for lifetime or no membership. */
  days_left: number | null;
};

export type FieldFilter =
  | { fieldId: string; op: "is"; value: string }
  | { fieldId: string; op: "at_least"; value: string }
  | { fieldId: string; op: "has_value" };

export type RosterFilter = {
  q: string;
  standings: Standing[];
  tierIds: string[];
  field: FieldFilter | null;
  /** Only members whose membership ends within this many days (and hasn't ended yet). */
  expiringWithinDays: number | null;
};
export const EMPTY_FILTER: RosterFilter = {
  q: "",
  standings: [],
  tierIds: [],
  field: null,
  expiringWithinDays: null,
};
/** Choices for the "expiring within" filter (the time-to-expiration report). */
export const EXPIRING_WINDOWS = [30, 60, 90] as const;

export type RosterSort = "name" | "paid_through" | "standing";

export function toRosterRows(
  members: readonly MemberRow[],
  values: Record<string, Record<string, unknown>>,
  graceDays: number,
  on: string,
): RosterRow[] {
  return members.map((m) => ({
    ...m,
    values: values[m.id] ?? {},
    standing: standing(m.membership, graceDays, on),
    days_left: daysToExpiration(m.membership, on),
  }));
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");

/** Position of a value in an ordered list (rank), or -1. */
function rankOf(field: RosterField, value: unknown): number {
  const ordered = [...field.options].sort((a, b) => a.sort_order - b.sort_order);
  return ordered.findIndex((o) => o.value === value);
}

function matchesField(row: RosterRow, f: FieldFilter, fields: readonly RosterField[]): boolean {
  const field = fields.find((x) => x.id === f.fieldId);
  const v = row.values[f.fieldId];
  if (!field) return true;
  const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  if (f.op === "has_value") return !empty;
  if (empty) return false;
  if (f.op === "at_least") {
    const need = rankOf(field, f.value);
    const have = rankOf(field, v);
    return need >= 0 && have >= need;
  }
  if (Array.isArray(v)) return v.includes(f.value);
  if (typeof v === "boolean") return String(v) === f.value;
  if (field.data_type === "text") return norm(String(v)).includes(norm(f.value));
  return String(v) === f.value;
}

export function filterRoster(
  rows: readonly RosterRow[],
  filter: RosterFilter,
  fields: readonly RosterField[],
): RosterRow[] {
  const q = norm(filter.q.trim());
  return rows.filter(
    (r) =>
      (!q || norm(`${r.display_name} ${r.email}`).includes(q)) &&
      (filter.standings.length === 0 || filter.standings.includes(r.standing)) &&
      (filter.tierIds.length === 0 ||
        (r.membership && filter.tierIds.includes(r.membership.tier_id))) &&
      (!filter.field || matchesField(r, filter.field, fields)) &&
      (filter.expiringWithinDays === null ||
        (r.days_left !== null && r.days_left >= 0 && r.days_left <= filter.expiringWithinDays)),
  );
}

const STANDING_ORDER: Standing[] = [
  "good",
  "grace",
  "pending",
  "lapsed",
  "cancelled",
  "declined",
  "none",
];

export function sortRoster(rows: readonly RosterRow[], by: RosterSort): RosterRow[] {
  const name = (r: RosterRow) => norm(r.display_name || r.email);
  return [...rows].sort((a, b) => {
    if (by === "standing")
      return (
        STANDING_ORDER.indexOf(a.standing) - STANDING_ORDER.indexOf(b.standing) ||
        name(a).localeCompare(name(b))
      );
    if (by === "paid_through") {
      // Soonest expiry first; lifetime and no date last.
      const pa = a.membership?.lifetime ? "9999" : (a.membership?.paid_through ?? "9999z");
      const pb = b.membership?.lifetime ? "9999" : (b.membership?.paid_through ?? "9999z");
      return pa.localeCompare(pb) || name(a).localeCompare(name(b));
    }
    return name(a).localeCompare(name(b));
  });
}

// ----- privacy (D-139, Q-11) -----

/** Whether a member is listed in the directory: their own choice, else the org's default. */
export function isListed(row: Pick<MemberRow, "directory_listed">, orgDefault: boolean): boolean {
  return row.directory_listed ?? orgDefault;
}

/**
 * Rows an export may contain. Members who opted out are left out unless the exporter chose to
 * include them and the parent organization allows that (privacy.admin_override_allowed).
 */
export function exportableRows<T extends Pick<MemberRow, "directory_listed">>(
  rows: readonly T[],
  opts: { orgDefault: boolean; includeOptedOut: boolean; overrideAllowed: boolean },
): T[] {
  if (opts.includeOptedOut && opts.overrideAllowed) return [...rows];
  return rows.filter((r) => isListed(r, opts.orgDefault));
}

// ----- CSV export -----

export type ExportColumn = { key: string; label: string; value: (r: RosterRow) => string };

/** A field's value as text for export (choice labels, "Yes"/"No", several choices with "; "). */
export function fieldText(field: RosterField, v: unknown): string {
  if (v === undefined || v === null) return "";
  const label = (x: unknown) => field.options.find((o) => o.value === x)?.label ?? String(x);
  if (Array.isArray(v)) return v.map(label).join("; ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field.options.length) return label(v);
  return String(v);
}

/**
 * Columns an export may contain. Admin-only fields need members.view; fields shown to members
 * or the public are always included (D-138).
 */
export function exportColumns(
  fields: readonly RosterField[],
  canSeeAdminFields: boolean,
  standingLabel: (s: Standing) => string,
): ExportColumn[] {
  const base: ExportColumn[] = [
    { key: "name", label: "Name", value: (r) => r.display_name },
    { key: "email", label: "Email", value: (r) => r.email },
    { key: "standing", label: "Standing", value: (r) => standingLabel(r.standing) },
    { key: "level", label: "Level", value: (r) => r.membership?.tier_name ?? "" },
    { key: "term", label: "Term", value: (r) => r.membership?.term_label ?? "" },
    { key: "member_since", label: "Member since", value: (r) => r.membership?.joined_on ?? "" },
    {
      key: "paid_through",
      label: "Paid through",
      value: (r) => (r.membership?.lifetime ? "Lifetime" : (r.membership?.paid_through ?? "")),
    },
  ];
  const extra = fields
    .filter((f) => canSeeAdminFields || f.visibility !== "admins")
    .map((f) => ({
      key: `field:${f.id}`,
      label: f.label,
      value: (r: RosterRow) => fieldText(f, r.values[f.id]),
    }));
  return [...base, ...extra];
}

/** Spreadsheet apps run cells starting with these as formulas; prefix them so they stay text. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with a header row and CRLF line endings. */
export function toCsv(rows: readonly RosterRow[], columns: readonly ExportColumn[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ----- saving and logging (migration 0011) -----

export type Segment = { id: string; name: string; filter: RosterFilter };

export const segmentsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["member-segments", orgId],
    queryFn: async (): Promise<Segment[]> => {
      const { data, error } = await db
        .from("member_segments")
        .select("id,name,filter")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        filter: { ...EMPTY_FILTER, ...(s.filter as Partial<RosterFilter>) },
      }));
    },
  });

export async function saveSegment(orgId: string, name: string, filter: RosterFilter) {
  const { error } = await db
    .from("member_segments")
    .upsert(
      { org_id: orgId, name: name.trim(), filter: filter as never },
      { onConflict: "org_id,name" },
    );
  if (error) throw error;
}

export async function deleteSegment(id: string) {
  const { error } = await db.from("member_segments").delete().eq("id", id);
  if (error) throw error;
}

/** Records the export in the audit log; the file is only produced if this succeeds. */
export async function logExport(
  orgId: string,
  rowCount: number,
  columns: string[],
  filter: RosterFilter & { include_opted_out?: boolean },
) {
  const { error } = await db.rpc("log_member_export", {
    _org: orgId,
    _row_count: rowCount,
    _columns: columns,
    _filter: filter as never,
  });
  if (error) throw error;
}
