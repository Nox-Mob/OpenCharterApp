import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AddToBoardPackage } from "@shared/ui/AddToBoardPackage";
import { suiteUrls } from "@shared/supabase/hosted";
import { supabase } from "@/integrations/supabase/client";
import type { ReportSection } from "@/modules/reports/pdf";
import { membershipModelQuery } from "@/modules/membership/home-chapter";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { formatPrice } from "@/modules/membership/tiers";
import { today } from "@/modules/membership/standing";
import {
  governanceRollupQuery,
  logReportExport,
  memberRollupQuery,
  revenueRollupQuery,
  revenueTotals,
  STANDING_SEGMENTS,
  standingShares,
  tableCsv,
  yearToDate,
  type MemberRollup,
  type StandingKey,
  currentMembers,
  rollupTotal,
} from "@/modules/reports/rollups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Standing is a status, so it uses the reserved status colors (good / warning / critical) and
 * always ships with its label (legend, hover text and the table's exact numbers). Pending is a
 * neutral gray, not a status color.
 */
const SEGMENT_COLOR: Record<StandingKey, string> = {
  good: "#0ca30c",
  grace: "#fab219",
  lapsed: "#d03b3b",
  pending: "#8e8d86",
};

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reports tab (E-23): members, revenue and board health for this org and every org below it.
 * A chapter has nothing below it, so a chapter admin sees their own chapter only (D-152).
 */
export function ReportsTab({
  org,
  canSeeMembers,
  canSeeRevenue,
  canSeeBoards,
}: {
  org: Org;
  canSeeMembers: boolean;
  canSeeRevenue: boolean;
  canSeeBoards: boolean;
}) {
  const [range, setRange] = useState(() => yearToDate(today()));
  const members = useQuery({ ...memberRollupQuery(org.id), enabled: canSeeMembers });
  // home-chapter model: members are counted once in the total (D-196)
  const model = useQuery({ ...membershipModelQuery(org.id), enabled: canSeeMembers });
  const homeChapter = model.data === "home_chapter";
  const revenue = useQuery({
    ...revenueRollupQuery(org.id, range.from, range.to),
    enabled: canSeeRevenue && range.from <= range.to,
  });
  const board = useQuery({ ...governanceRollupQuery(org.id), enabled: canSeeBoards });
  const on = today();

  async function exportCsv(
    report: "members" | "revenue" | "governance",
    header: string[],
    rows: (string | number)[][],
    filter: Record<string, string> = {},
  ) {
    try {
      await logReportExport(org.id, report, rows.length, filter);
    } catch {
      return void toast.error("Couldn't record the export, so it wasn't created");
    }
    download(`${org.slug}-${report}-${on}.csv`, tableCsv(header, rows));
  }

  const membersTable = (): { header: string[]; rows: (string | number)[][] } => ({
    header: [
      "Organization",
      "Current members",
      "Good standing",
      "Grace period",
      "Lapsed",
      "Pending",
      "Cancelled or declined",
      "Records without a membership",
      "Joined in the last 30 days",
      "Expiring within 30 days",
      "Expiring within 60 days",
      "Expiring within 90 days",
    ],
    rows: members.data!.map((r) => [
      r.name,
      currentMembers(r),
      r.good,
      r.grace,
      r.lapsed,
      r.pending,
      r.ended,
      r.no_membership,
      r.joined_30d,
      r.expiring_30,
      r.expiring_60,
      r.expiring_90,
    ]),
  });
  const revenueTable = (): { header: string[]; rows: (string | number)[][] } => ({
    header: ["Organization", "Currency", "Payments", "Received", "Refunded", "Net"],
    rows: revenue.data!.map((r) => [
      r.name,
      r.currency,
      r.payments,
      (r.gross_minor / 100).toFixed(2),
      (r.refunded_minor / 100).toFixed(2),
      (r.net_minor / 100).toFixed(2),
    ]),
  });
  const governanceTable = (): { header: string[]; rows: (string | number)[][] } => ({
    header: ["Organization", "Required seats", "Vacant", "Vacant seats", "Terms past their end"],
    rows: board.data!.map((r) => [
      r.name,
      r.required_seats,
      r.vacant_required,
      r.vacant_titles.join("; "),
      r.terms_past_end,
    ]),
  });
  // S-13: the visible reports as one PDF, to keep or to put in an OpenBoardApp board package.
  const reportSections = (): ReportSection[] => [
    ...(canSeeMembers && members.data ? [{ heading: "Members", ...membersTable() }] : []),
    ...(canSeeRevenue && revenue.data
      ? [{ heading: `Revenue, ${range.from} to ${range.to}`, ...revenueTable() }]
      : []),
    ...(canSeeBoards && board.data ? [{ heading: "Boards", ...governanceTable() }] : []),
  ];
  async function reportsPdfFile() {
    const { reportsPdf } = await import("@/modules/reports/pdf");
    const doc = reportsPdf({
      organization: org.name,
      subtitle: `As of ${on}`,
      sections: reportSections(),
    });
    return { doc, fileName: `${org.slug}-reports-${on}.pdf` };
  }
  const indent = (depth: number) => ({ paddingLeft: `${depth * 1.25}rem` });

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start gap-2">
        <Button
          variant="outline"
          onClick={() => void reportsPdfFile().then(({ doc, fileName }) => doc.save(fileName))}
        >
          Download reports (PDF)
        </Button>
        <AddToBoardPackage
          client={supabase as unknown as SupabaseClient}
          orgId={org.org_id ?? org.id}
          sourceApp="charter"
          boardUrl={suiteUrls().board}
          makePdf={async () => {
            const { doc, fileName } = await reportsPdfFile();
            return { pdf: doc.output("blob"), fileName, title: `${org.name}: membership reports` };
          }}
        />
      </div>
      {canSeeMembers && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Members</h2>
              <p className="text-sm text-muted-foreground">
                {org.type === "chapter"
                  ? `${org.name}, as of today.`
                  : `${org.name} and every organization below it, as of today.`}{" "}
                Members are people with a current membership (good standing or in grace); records
                without one, such as administrators, aren&apos;t counted.
                {homeChapter && org.type !== "chapter"
                  ? " Each member belongs to the national and is also listed in their chapter, so the total counts them once."
                  : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!members.data?.length}
              onClick={() => void exportCsv("members", membersTable().header, membersTable().rows)}
            >
              Export CSV
            </Button>
          </div>
          <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
            {STANDING_SEGMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: SEGMENT_COLOR[s.key] }}
                />
                {s.label}
              </li>
            ))}
          </ul>
          {members.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="w-40">Standing</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Good</TableHead>
                    <TableHead className="text-right">Grace</TableHead>
                    <TableHead className="text-right">Lapsed</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">New (30 days)</TableHead>
                    <TableHead className="text-right">Expiring 30 / 60 / 90</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(members.data ?? []).map((r) => (
                    <MemberRow key={r.unit_id} r={r} label={r.name} style={indent(r.depth)} />
                  ))}
                  {(members.data?.length ?? 0) > 1 && (
                    <MemberRow
                      r={rollupTotal(members.data!, homeChapter)}
                      label="Total"
                      className="font-semibold"
                    />
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {canSeeRevenue && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Revenue</h2>
              <p className="text-sm text-muted-foreground">
                Payments each organization received. Test payments aren't included.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="rev-from">From</Label>
                <Input
                  id="rev-from"
                  type="date"
                  value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rev-to">To</Label>
                <Input
                  id="rev-to"
                  type="date"
                  value={range.to}
                  onChange={(e) => setRange({ ...range, to: e.target.value })}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!revenue.data?.length}
                onClick={() =>
                  void exportCsv("revenue", revenueTable().header, revenueTable().rows, range)
                }
              >
                Export CSV
              </Button>
            </div>
          </div>
          {range.from > range.to ? (
            <p className="text-sm text-destructive">The start date is after the end date.</p>
          ) : (revenue.data?.length ?? 0) === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {revenue.isLoading ? "Loading…" : "No payments in this period."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Refunded</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.data!.map((r) => (
                    <TableRow key={`${r.unit_id}-${r.currency}`}>
                      <TableCell style={indent(r.depth)}>{r.name}</TableCell>
                      <TableCell className="text-right">{r.payments}</TableCell>
                      <TableCell className="text-right">
                        {formatPrice(r.gross_minor, r.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPrice(r.refunded_minor, r.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPrice(r.net_minor, r.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {revenueTotals(revenue.data!).map((t) => (
                    <TableRow key={`total-${t.currency}`} className="font-semibold">
                      <TableCell>Total ({t.currency})</TableCell>
                      <TableCell className="text-right">{t.payments}</TableCell>
                      <TableCell className="text-right">
                        {formatPrice(t.gross, t.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPrice(t.refunded, t.currency)}
                      </TableCell>
                      <TableCell className="text-right">{formatPrice(t.net, t.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {canSeeBoards && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Boards</h2>
              <p className="text-sm text-muted-foreground">
                Required seats with nobody in them, and officers still serving past their term's
                end.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!board.data?.length}
              onClick={() =>
                void exportCsv("governance", governanceTable().header, governanceTable().rows)
              }
            >
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead className="text-right">Required seats</TableHead>
                  <TableHead>Vacant</TableHead>
                  <TableHead className="text-right">Terms past their end</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(board.data ?? []).map((r) => (
                  <TableRow key={r.unit_id}>
                    <TableCell style={indent(r.depth)}>{r.name}</TableCell>
                    <TableCell className="text-right">{r.required_seats}</TableCell>
                    <TableCell>
                      {r.vacant_required === 0 ? "—" : r.vacant_titles.join(", ")}
                    </TableCell>
                    <TableCell className="text-right">{r.terms_past_end || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

function MemberRow({
  r,
  label,
  style,
  className,
}: {
  r: Omit<MemberRollup, "unit_id" | "name" | "type" | "parent_id" | "depth">;
  label: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const shares = standingShares(r);
  return (
    <TableRow className={className}>
      <TableCell style={style}>{label}</TableCell>
      <TableCell>
        {shares.length === 0 ? (
          <span className="text-xs text-muted-foreground">No memberships</span>
        ) : (
          <div className="flex h-2 w-36 gap-[2px]" role="img" aria-label={`${label} standing`}>
            {shares.map((s) => (
              <span
                key={s.key}
                className="h-full rounded-sm"
                style={{ width: `${s.share * 100}%`, background: SEGMENT_COLOR[s.key] }}
                title={`${s.label}: ${s.count} (${Math.round(s.share * 100)}%)`}
              />
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">{currentMembers(r)}</TableCell>
      <TableCell className="text-right">{r.good}</TableCell>
      <TableCell className="text-right">{r.grace}</TableCell>
      <TableCell className="text-right">{r.lapsed}</TableCell>
      <TableCell className="text-right">{r.pending}</TableCell>
      <TableCell className="text-right">{r.joined_30d}</TableCell>
      <TableCell className="text-right">
        {r.expiring_30} / {r.expiring_60} / {r.expiring_90}
      </TableCell>
    </TableRow>
  );
}
