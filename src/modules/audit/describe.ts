import { SETTINGS } from "@/engines/settings";
import { formatPrice } from "@/modules/membership/tiers";

/**
 * Readable audit log (U3, D-191). Turns stored audit events (the full row before and after each
 * change, written by triggers since migration 0000) into "Nora National modified Board settings ·
 * President" with each changed field's previous and current value. Events from one save share a
 * transaction (tx_id, since 0037) and are shown as one entry.
 */
export type AuditEvent = {
  id: number;
  created_at: string;
  tx_id: number | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Names of the records an event points at, by column (e.g. template_id → "President"). */
  refs: Record<string, string>;
};

export type FieldChange = { field: string; previous: string; current: string };
export type DescribedEvent = {
  id: number;
  at: Date;
  who: string;
  /** What happened, after the person: "modified Board settings". */
  what: string;
  area: string;
  /** The record it happened to, if it has a name: "President". */
  record: string | null;
  changes: FieldChange[];
};
export type AuditEntry = DescribedEvent & { more: DescribedEvent[] };

const AREAS: Record<string, string> = {
  organizations: "General settings",
  org_settings: "Settings",
  tax_profiles: "Tax profile",
  setup_states: "Setup",
  attribute_definitions: "Member fields",
  attribute_options: "Member fields",
  attribute_values: "Member details",
  membership_tiers: "Membership levels",
  tier_terms: "Membership levels",
  pricing_rules: "Pricing rules",
  memberships: "Memberships",
  payments: "Payments",
  receipts: "Receipts",
  gateway_connections: "Payment connection",
  org_member_profiles: "Members",
  role_assignments: "Roles",
  roles: "Roles",
  role_permissions: "Roles",
  invitations: "Invitations",
  member_segments: "Saved views",
  seat_templates: "Board settings",
  seat_terms: "Board settings",
  seat_title_overrides: "Board settings",
  seat_contacts: "Board settings",
  appointments: "Board",
  affiliation_history: "Chapters",
  members: "Members",
  report: "Reports",
  payments_export: "Payments",
  demo_organization: "Demo data",
  smoke_data: "Demo data",
};
export const areaOf = (e: Pick<AuditEvent, "target_type" | "before" | "after">) =>
  e.target_type === "attribute_definitions" && (e.after ?? e.before)?.["applies_to"] === "chapter"
    ? "Chapter fields"
    : (AREAS[e.target_type] ?? humanize(e.target_type));

const VERBS: Record<string, string> = {
  insert: "added",
  update: "modified",
  delete: "removed",
  export: "exported",
  remove: "removed from the roster",
  restore: "restored to the roster",
  import: "imported members into",
  purge: "cleaned up",
  recalculate: "recalculated",
};

/** Columns that never help a reader (identifiers, bookkeeping). */
const HIDDEN = new Set([
  "id",
  "org_id",
  "created_at",
  "updated_at",
  "updated_by",
  "created_by",
  "set_by",
  "connected_by",
  "connected_at",
  "appointed_by",
  "ended_by",
  "invited_by",
  "accepted_by",
  "changed_by",
  "actor_id",
  "ancestor_ids",
  "sort_order",
  "token_hash",
  "seq",
  "snapshot",
  "answers",
  "checkout_ref",
  "gateway_ref",
  "payer_user_id",
  "claimed_at",
  "entity_id",
]);

const LABELS: Record<string, string> = {
  template_id: "Seat",
  profile_id: "Member",
  role_id: "Role",
  tier_id: "Level",
  term_id: "Term",
  definition_id: "Field",
  user_id: "Person",
  membership_id: "Membership",
  source_tier_id: "Started from",
  home_org_id: "Home chapter",
  from_org_id: "From",
  to_org_id: "To",
  display_name: "Name",
  email: "Email",
  title: "Title",
  name: "Name",
  label: "Label",
  key: "Key",
  description: "Description",
  required: "Required",
  seat_count: "Number of seats",
  default_term_count: "Suggested term",
  default_term_unit: "Suggested term unit",
  length_count: "Length",
  length_unit: "Length unit",
  price_minor: "Price",
  amount_minor: "Amount",
  refunded_amount_minor: "Refunded",
  discount_pct: "Discount (%)",
  role_email: "Role email",
  bylaw_reference: "By-law reference",
  effective_from: "From",
  starts_on: "Started",
  planned_end: "Term ends",
  ended_on: "Ended",
  end_reason: "Reason",
  joined_on: "Joined",
  paid_through: "Paid through",
  received_on: "Received",
  logo_path: "Logo",
  legal_name: "Legal name",
  ein: "EIN",
  tax_status: "Tax status",
  status: "Status",
  active: "Active",
  scope: "Used by",
  visibility: "Who can see it",
  member_editable: "Members can edit it",
  show_in_directory: "Shown in the directory",
  directory_listed: "Listed in the directory",
  left_at: "Left",
  applied_at: "Applied",
  suggested: "Suggested to chapters",
  link_mode: "Copy or linked",
  price_rule: "Linked price",
  price_value: "Price difference",
  reason: "Reason",
};

const SCOPES: Record<string, string> = {
  self: "This organization",
  chapters: "Every chapter below",
  self_and_chapters: "This organization and every chapter below",
};
const MODES: Record<string, string> = {
  inherit: "Follows the parent",
  override: "Chapters may change it",
  locked: "Locked for chapters",
};

function humanize(key: string): string {
  const s = key.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const isUuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** One value as a reader would want to see it. */
export function formatValue(
  field: string,
  value: unknown,
  refs: Record<string, string>,
  currency = "USD",
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.endsWith("_minor") && typeof value === "number") return formatPrice(value, currency);
  if (field === "scope" && typeof value === "string") return SCOPES[value] ?? value;
  if (field === "mode" && typeof value === "string") return MODES[value] ?? value;
  if (isUuid(value)) return refs[field] ?? "a removed record";
  if (typeof value === "string") {
    // timestamps: date and time without the noise
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString();
    return value;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value))
    return value.map((v) => formatValue(field, v, refs, currency)).join(", ");
  return JSON.stringify(value);
}

/** The setting an org_settings row is about, and how to show its value. */
function settingChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { record: string; changes: FieldChange[] } {
  const key = String((after ?? before)?.["key"] ?? "");
  const def = SETTINGS.find((s) => s.key === key);
  const show = (v: unknown) => {
    const option = def?.options?.find((o) => o.value === v);
    return option ? option.label : formatValue("value", v, {});
  };
  const changes: FieldChange[] = [];
  if (JSON.stringify(before?.["value"]) !== JSON.stringify(after?.["value"]))
    changes.push({
      field: def?.label ?? humanize(key.split(".").pop() ?? key),
      previous: before ? show(before["value"]) : "—",
      current: after ? show(after["value"]) : "—",
    });
  if (before?.["mode"] !== after?.["mode"] && (before?.["mode"] || after?.["mode"]))
    changes.push({
      field: "For chapters",
      previous: before ? formatValue("mode", before["mode"], {}) : "—",
      current: after ? formatValue("mode", after["mode"], {}) : "—",
    });
  return { record: def?.label ?? humanize(key), changes };
}

/** The changed fields of an event (all non-empty ones for an addition or removal). */
export function fieldChanges(e: AuditEvent): FieldChange[] {
  const before = e.before ?? {};
  const after = e.after ?? {};
  const currency = String(after["currency"] ?? before["currency"] ?? "USD");
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => !HIDDEN.has(k) && k !== "currency",
  );
  const out: FieldChange[] = [];
  for (const k of keys) {
    const b = e.before ? before[k] : undefined;
    const a = e.after ? after[k] : undefined;
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const previous = e.before ? formatValue(k, b, e.refs, currency) : "—";
    const current = e.after ? formatValue(k, a, e.refs, currency) : "—";
    // an addition or removal lists only fields that hold something
    if (previous === "—" && current === "—") continue;
    out.push({ field: LABELS[k] ?? humanize(k), previous, current });
  }
  return out;
}

/** The record an event is about, by its own name or a referenced one. */
function recordName(e: AuditEvent): string | null {
  const row = e.after ?? e.before ?? {};
  for (const k of ["title", "name", "label", "display_name", "email"]) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const k of ["template_id", "definition_id", "tier_id", "term_id", "profile_id", "user_id"])
    if (e.refs[k]) return e.refs[k]!;
  return null;
}

export function describeEvent(e: AuditEvent): DescribedEvent {
  const who = e.actor_name ?? (e.actor_id ? "Someone" : "The system");
  const area = areaOf(e);
  const base = { id: e.id, at: new Date(e.created_at), who, area };
  const after = e.after ?? {};
  const before = e.before ?? {};

  if (e.target_type === "org_settings") {
    const { record, changes } = settingChange(e.before, e.after);
    return { ...base, what: `${VERBS[e.action] ?? e.action} ${area}`, record, changes };
  }
  if (e.target_type === "appointments") {
    const seat = e.refs["template_id"] ?? "a seat";
    const person = e.refs["profile_id"] ?? "someone";
    const ended = e.action === "update" && !before["ended_on"] && after["ended_on"];
    return {
      ...base,
      what:
        e.action === "insert"
          ? `appointed ${person} as`
          : ended
            ? `ended ${person}'s term as`
            : `modified the appointment for`,
      record: seat,
      changes: fieldChanges(e).filter((c) => c.field !== "Seat" && c.field !== "Member"),
    };
  }
  if (e.target_type === "role_assignments") {
    const role = e.refs["role_id"] ?? "a role";
    const person = e.refs["user_id"] ?? "someone";
    return {
      ...base,
      what: e.action === "delete" ? `removed the ${role} role from` : `gave the ${role} role to`,
      record: person,
      changes: [],
    };
  }
  if (e.target_type === "setup_states") {
    const flow = String(after["flow_id"] ?? "");
    return { ...base, what: `applied ${humanize(flow)} setup`, record: null, changes: [] };
  }
  if (e.target_type === "seat_title_overrides") {
    // a chapter's own title for an inherited seat: before its first rename, the seat's own title
    const seat = e.refs["template_id"] ?? "a seat";
    return {
      ...base,
      what: `${VERBS[e.action === "insert" ? "update" : e.action] ?? e.action} ${area}`,
      record: seat,
      changes: [
        {
          field: "Title",
          previous: e.before ? formatValue("title", before["title"], {}) : seat,
          current: e.after ? formatValue("title", after["title"], {}) : seat,
        },
      ],
    };
  }
  if (e.action === "export" || e.action === "import" || e.action === "purge") {
    const rows = after["rows"];
    return {
      ...base,
      what: `${VERBS[e.action] ?? e.action} ${area}`,
      record: typeof rows === "number" ? `${rows} row${rows === 1 ? "" : "s"}` : null,
      changes:
        e.action === "import"
          ? [
              { field: "Added", previous: "—", current: String(after["created"] ?? 0) },
              { field: "Updated", previous: "—", current: String(after["updated"] ?? 0) },
            ]
          : [],
    };
  }
  if (e.action === "remove" || e.action === "restore") {
    const reason = typeof after["reason"] === "string" ? after["reason"] : "";
    return {
      ...base,
      what: VERBS[e.action]!,
      record: recordName(e),
      changes: reason ? [{ field: "Reason", previous: "—", current: reason }] : [],
    };
  }
  return {
    ...base,
    what: `${VERBS[e.action] ?? e.action} ${area}`,
    record: recordName(e),
    changes: fieldChanges(e),
  };
}

/** "Nora National modified Board settings · President" (the time goes in front). */
export function sentence(e: DescribedEvent) {
  return `${e.who} ${e.what}${e.record ? ` · ${e.record}` : ""}`;
}

/** Events from one save (same transaction and person) become one entry, newest first. */
export function groupEvents(events: readonly AuditEvent[]): AuditEntry[] {
  const out: AuditEntry[] = [];
  let current: { tx: number; actor: string | null; entry: AuditEntry } | null = null;
  for (const e of events) {
    const d = describeEvent(e);
    if (current && e.tx_id !== null && current.tx === e.tx_id && current.actor === e.actor_id) {
      current.entry.more.push(d);
      continue;
    }
    const entry: AuditEntry = { ...d, more: [] };
    out.push(entry);
    current = e.tx_id === null ? null : { tx: e.tx_id, actor: e.actor_id, entry };
  }
  // an entry leads with its most telling event: an applied setup or an import, else the first
  for (const entry of out) {
    const all = [entryHead(entry), ...entry.more];
    const lead = all.find((d) => d.what.startsWith("applied ") || d.what.startsWith("imported"));
    if (lead && lead !== all[0]) {
      const rest = all.filter((d) => d !== lead);
      Object.assign(entry, lead, { more: rest });
    }
  }
  return out;
}

function entryHead(e: AuditEntry): DescribedEvent {
  const { more: _more, ...head } = e;
  return head;
}

/** Parse what the database returns (jsonb arrives as unknown). */
export function toAuditEvent(row: {
  id: number;
  created_at: string;
  tx_id?: number | null;
  actor_id: string | null;
  actor_name?: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  before?: unknown;
  after?: unknown;
  refs?: unknown;
}): AuditEvent {
  const obj = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  return {
    id: row.id,
    created_at: row.created_at,
    tx_id: row.tx_id ?? null,
    actor_id: row.actor_id,
    actor_name: row.actor_name ?? null,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    before: obj(row.before),
    after: obj(row.after),
    refs: (obj(row.refs) ?? {}) as Record<string, string>,
  };
}
