import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STANDING_LABELS, type Standing } from "@/modules/membership/standing";
import {
  deleteSegment,
  EMPTY_FILTER,
  EXPIRING_WINDOWS,
  saveSegment,
  segmentsQuery,
  type FieldFilter,
  type RosterField,
  type RosterFilter,
  type RosterSort,
} from "@/modules/members/roster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ANY = "__any";
const STANDINGS: Standing[] = [
  "good",
  "grace",
  "lapsed",
  "pending",
  "cancelled",
  "declined",
  "none",
];

/** Search, filters, sorting, saved views and export for the member list (E-14). */
export function RosterToolbar({
  orgId,
  filter,
  onFilter,
  sort,
  onSort,
  fields,
  levels,
  showMembership,
  canSaveViews,
  canUseViews,
  canExport,
  onExport,
  shown,
  total,
  optedOut = 0,
  includeOptedOut = false,
  onIncludeOptedOut,
  overrideAllowed = true,
}: {
  orgId: string;
  filter: RosterFilter;
  onFilter: (f: RosterFilter) => void;
  sort: RosterSort;
  onSort: (s: RosterSort) => void;
  fields: readonly RosterField[];
  levels: readonly { id: string; name: string }[];
  /** Standing and level filters need memberships (migration 0008). */
  showMembership: boolean;
  canSaveViews: boolean;
  canUseViews: boolean;
  canExport: boolean;
  onExport: () => void;
  shown: number;
  total: number;
  /** Members in the current list who opted out of the directory (D-139). */
  optedOut?: number;
  includeOptedOut?: boolean;
  onIncludeOptedOut?: (v: boolean) => void;
  overrideAllowed?: boolean;
}) {
  const qc = useQueryClient();
  const segments = useQuery({ ...segmentsQuery(orgId), enabled: canUseViews });
  const field = fields.find((f) => f.id === filter.field?.fieldId);
  const set = (patch: Partial<RosterFilter>) => onFilter({ ...filter, ...patch });
  const active =
    filter.q !== "" ||
    filter.standings.length > 0 ||
    filter.tierIds.length > 0 ||
    !!filter.field ||
    filter.expiringWithinDays !== null;

  function pickField(id: string) {
    const f = fields.find((x) => x.id === id);
    if (!f) return set({ field: null });
    const first = [...f.options].sort((a, b) => a.sort_order - b.sort_order)[0]?.value ?? "";
    const next: FieldFilter =
      f.data_type === "ordered"
        ? { fieldId: id, op: "at_least", value: first }
        : f.data_type === "boolean"
          ? { fieldId: id, op: "is", value: "true" }
          : f.options.length
            ? { fieldId: id, op: "is", value: first }
            : { fieldId: id, op: "has_value" };
    set({ field: next });
  }

  async function saveView() {
    const name = window.prompt("Name this view")?.trim();
    if (!name) return;
    try {
      await saveSegment(orgId, name, filter);
      toast.success("View saved");
      qc.invalidateQueries({ queryKey: ["member-segments", orgId] });
    } catch {
      toast.error("Couldn't save the view");
    }
  }

  async function removeView(id: string) {
    try {
      await deleteSegment(id);
      qc.invalidateQueries({ queryKey: ["member-segments", orgId] });
    } catch {
      toast.error("Couldn't remove the view");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search members"
          placeholder="Search name or email"
          className="w-56"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        {showMembership && (
          <Select
            value={filter.standings[0] ?? ANY}
            onValueChange={(v) => set({ standings: v === ANY ? [] : [v as Standing] })}
          >
            <SelectTrigger className="w-44" aria-label="Standing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any standing</SelectItem>
              {STANDINGS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STANDING_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {showMembership && levels.length > 0 && (
          <Select
            value={filter.tierIds[0] ?? ANY}
            onValueChange={(v) => set({ tierIds: v === ANY ? [] : [v] })}
          >
            <SelectTrigger className="w-40" aria-label="Level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any level</SelectItem>
              {levels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {fields.length > 0 && (
          <Select value={filter.field?.fieldId ?? ANY} onValueChange={(v) => pickField(v)}>
            <SelectTrigger className="w-40" aria-label="Member field">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any field</SelectItem>
              {fields.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {field && filter.field && filter.field.op !== "has_value" && field.options.length > 0 && (
          <Select
            value={filter.field.value}
            onValueChange={(v) => set({ field: { ...filter.field!, value: v } as FieldFilter })}
          >
            <SelectTrigger className="w-40" aria-label={`${field.label} value`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...field.options]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {field.data_type === "ordered" ? `${o.label} or higher` : o.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {field && field.data_type === "boolean" && filter.field?.op === "is" && (
          <Select
            value={filter.field.value}
            onValueChange={(v) => set({ field: { fieldId: field.id, op: "is", value: v } })}
          >
            <SelectTrigger className="w-28" aria-label={`${field.label} value`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        )}
        {field && field.options.length === 0 && field.data_type !== "boolean" && (
          <Input
            aria-label={`${field.label} contains`}
            placeholder="Contains… (blank: has a value)"
            className="w-52"
            value={filter.field?.op === "is" ? filter.field.value : ""}
            onChange={(e) =>
              set({
                field: e.target.value
                  ? { fieldId: field.id, op: "is", value: e.target.value }
                  : { fieldId: field.id, op: "has_value" },
              })
            }
          />
        )}
        {showMembership && (
          <Select
            value={filter.expiringWithinDays === null ? ANY : String(filter.expiringWithinDays)}
            onValueChange={(v) => set({ expiringWithinDays: v === ANY ? null : Number(v) })}
          >
            <SelectTrigger className="w-48" aria-label="Expiring">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any expiry</SelectItem>
              {EXPIRING_WINDOWS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  Expiring within {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sort} onValueChange={(v) => onSort(v as RosterSort)}>
          <SelectTrigger className="w-44" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort by name</SelectItem>
            {showMembership && <SelectItem value="paid_through">Expiring soonest</SelectItem>}
            {showMembership && <SelectItem value="standing">Sort by standing</SelectItem>}
          </SelectContent>
        </Select>
        {active && (
          <Button size="sm" variant="ghost" onClick={() => onFilter(EMPTY_FILTER)}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{`Showing ${shown} of ${total}`}</span>
        {canUseViews &&
          (segments.data ?? []).map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
            >
              <button className="hover:underline" onClick={() => onFilter(s.filter)}>
                {s.name}
              </button>
              {canSaveViews && (
                <button aria-label={`Remove view ${s.name}`} onClick={() => removeView(s.id)}>
                  ×
                </button>
              )}
            </span>
          ))}
        {canUseViews && canSaveViews && active && (
          <Button size="sm" variant="outline" onClick={saveView}>
            Save this view
          </Button>
        )}
        {canExport &&
          optedOut > 0 &&
          (overrideAllowed ? (
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={includeOptedOut}
                onChange={(e) => onIncludeOptedOut?.(e.target.checked)}
              />
              Include {optedOut} member{optedOut === 1 ? "" : "s"} who opted out of the directory
            </label>
          ) : (
            <span className="text-xs text-muted-foreground">
              {optedOut} member{optedOut === 1 ? "" : "s"} who opted out won't be exported
            </span>
          ))}
        {canExport && (
          <Button size="sm" variant="outline" onClick={onExport} disabled={shown === 0}>
            Export CSV
          </Button>
        )}
      </div>
    </div>
  );
}
