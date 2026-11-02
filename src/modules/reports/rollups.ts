import { queryOptions } from "@tanstack/react-query";
import { db, type PendingFunctions } from "@/lib/db/pending-schema";
import { csvCell } from "@/modules/members/roster";

/**
 * National roll-ups (E-23, D-145): totals for an org and every org below it. The database
 * returns aggregates only (org_rollup_members / _revenue / _governance), so a roll-up never
 * shows another chapter's members. Exporting a report is audited (log_report_export).
 */
export type MemberRollup = PendingFunctions["org_rollup_members"]["Returns"][number];
export type RevenueRollup = PendingFunctions["org_rollup_revenue"]["Returns"][number];
export type GovernanceRollup = PendingFunctions["org_rollup_governance"]["Returns"][number];

export const memberRollupQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["rollup-members", orgId],
    queryFn: async (): Promise<MemberRollup[]> => {
      const { data, error } = await db.rpc("org_rollup_members", { _org: orgId });
      if (error) throw error;
      return data ?? [];
    },
  });

export const revenueRollupQuery = (orgId: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["rollup-revenue", orgId, from, to],
    queryFn: async (): Promise<RevenueRollup[]> => {
      const { data, error } = await db.rpc("org_rollup_revenue", {
        _org: orgId,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

export const governanceRollupQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["rollup-governance", orgId],
    queryFn: async (): Promise<GovernanceRollup[]> => {
      const { data, error } = await db.rpc("org_rollup_governance", { _org: orgId });
      if (error) throw error;
      return data ?? [];
    },
  });

// ----- pure helpers -----

const MEMBER_COUNTS = [
  "profiles",
  "good",
  "grace",
  "lapsed",
  "pending",
  "ended",
  "no_membership",
  "joined_30d",
  "expiring_30",
  "expiring_60",
  "expiring_90",
] as const;
export type MemberCounts = Pick<MemberRollup, (typeof MEMBER_COUNTS)[number]>;

export function memberTotals(rows: readonly MemberRollup[]): MemberCounts {
  const t = Object.fromEntries(MEMBER_COUNTS.map((k) => [k, 0])) as MemberCounts;
  for (const r of rows) for (const k of MEMBER_COUNTS) t[k] += r[k];
  return t;
}

/** Totals per currency (amounts are never added across currencies). */
export function revenueTotals(rows: readonly RevenueRollup[]) {
  const by = new Map<string, { payments: number; gross: number; refunded: number; net: number }>();
  for (const r of rows) {
    const t = by.get(r.currency) ?? { payments: 0, gross: 0, refunded: 0, net: 0 };
    t.payments += r.payments;
    t.gross += r.gross_minor;
    t.refunded += r.refunded_minor;
    t.net += r.net_minor;
    by.set(r.currency, t);
  }
  return [...by.entries()].map(([currency, t]) => ({ currency, ...t }));
}

export type StandingKey = "good" | "grace" | "lapsed" | "pending";
export const STANDING_SEGMENTS: readonly { key: StandingKey; label: string }[] = [
  { key: "good", label: "Good standing" },
  { key: "grace", label: "Grace period" },
  { key: "lapsed", label: "Lapsed" },
  { key: "pending", label: "Pending" },
];

/** Shares of members with a membership, for the standing bar (empty when there are none). */
export function standingShares(r: Pick<MemberRollup, StandingKey>) {
  const total = STANDING_SEGMENTS.reduce((n, s) => n + r[s.key], 0);
  if (total === 0) return [];
  return STANDING_SEGMENTS.filter((s) => r[s.key] > 0).map((s) => ({
    ...s,
    count: r[s.key],
    share: r[s.key] / total,
  }));
}

/** First day of the year and today, as YYYY-MM-DD. */
export function yearToDate(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

/** RFC 4180 CSV with formula protection (same rules as member exports). */
export function tableCsv(header: readonly string[], rows: readonly (string | number)[][]): string {
  const line = (cells: readonly (string | number)[]) =>
    cells.map((c) => csvCell(String(c))).join(",");
  return [line(header), ...rows.map(line)].join("\r\n") + "\r\n";
}

export async function logReportExport(
  orgId: string,
  report: "members" | "revenue" | "governance",
  rowCount: number,
  filter: Record<string, string> = {},
) {
  const { error } = await db.rpc("log_report_export", {
    _org: orgId,
    _report: report,
    _row_count: rowCount,
    _filter: filter,
  });
  if (error) throw error;
}
