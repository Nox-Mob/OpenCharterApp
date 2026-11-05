import { useState } from "react";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import { today } from "@/modules/membership/standing";
import { yearToDate } from "@/modules/reports/rollups";
import { exportPayments, exportSummary, paymentsCsv } from "@/modules/payments/export";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * "Export payments" (A3, D-173): paid and refunded payments in a date range as CSV, for this org
 * or, for a national or region, every org below it too. The database audits each export.
 */
export function PaymentsExport({ org }: { org: Org }) {
  const ready = useFeatureReady("payments_export") === true;
  const [range, setRange] = useState(() => yearToDate(today()));
  const [below, setBelow] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasBelow = org.type === "national" || org.type === "region";
  if (!ready) return null;

  async function run() {
    if (range.from > range.to) return void toast.error("The start date is after the end date");
    setBusy(true);
    try {
      const rows = await exportPayments(org.id, range.from, range.to, hasBelow && below);
      download(`${org.slug}-payments-${range.from}-to-${range.to}.csv`, paymentsCsv(rows));
      toast.success(`Exported ${exportSummary(rows)}`);
    } catch {
      toast.error("Couldn't export: you may not have permission to see these payments");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border bg-card p-5" aria-labelledby="export-heading">
      <div>
        <h2 id="export-heading" className="text-lg font-semibold">
          Export payments
        </h2>
        <p className="text-sm text-muted-foreground">
          Paid and refunded payments as a spreadsheet (CSV) for your bookkeeping: amounts, refunds,
          receipt numbers and tax treatment. Each export is recorded in the audit log.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="export-from">From</Label>
          <Input
            id="export-from"
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="export-to">To</Label>
          <Input
            id="export-to"
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </div>
        {hasBelow && (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={below} onCheckedChange={(c) => setBelow(c === true)} />
            Include every organization below {org.name}
          </label>
        )}
        <Button onClick={run} disabled={busy}>
          {busy ? "Exporting…" : "Export CSV"}
        </Button>
      </div>
    </section>
  );
}
