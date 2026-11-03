import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { attributeDefsQuery } from "@/modules/attributes/queries";
import {
  buildRows,
  guessTargets,
  parseCsv,
  runImport,
  TARGET_LABELS,
  templateCsv,
  type ImportResult,
  type ImportTarget,
} from "@/modules/members/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_ROWS = 20000;

/**
 * Import members from a spreadsheet (U1, D-189): choose a CSV file, match its columns, check it
 * (nothing is saved), then import. Running the same file again updates instead of duplicating.
 */
export function ImportMembersDialog({
  org,
  homeChapterNational,
  open,
  onClose,
}: {
  org: Org;
  /** The home-chapter model at a national: a Chapter column picks each member's chapter. */
  homeChapterNational: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const memberDefs = useMemo(
    () => (defs.data ?? []).filter((d) => d.applies_to === "member" && d.active),
    [defs.data],
  );
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [targets, setTargets] = useState<ImportTarget[]>([]);
  const [checked, setChecked] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFileName("");
    setTable(null);
    setTargets([]);
    setChecked(null);
    setDone(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (rows.length < 2)
      return void toast.error("The file needs a heading row and at least one member.");
    if (rows.length - 1 > MAX_ROWS)
      return void toast.error(`Import at most ${MAX_ROWS} members at a time; split the file.`);
    setFileName(file.name);
    setTable(rows);
    setTargets(guessTargets(rows[0]!, memberDefs, homeChapterNational));
    setChecked(null);
    setDone(null);
  }

  const headers = table?.[0] ?? [];
  const rows = useMemo(
    () => (table ? buildRows(table, targets, memberDefs) : []),
    [table, targets, memberDefs],
  );
  const mapsNameOrEmail = targets.includes("name") || targets.includes("email");

  async function run(apply: boolean) {
    setBusy(true);
    try {
      const result = await runImport(org.id, rows, apply);
      if (apply) {
        setDone(result);
        for (const k of ["members", "members-tree", "overview-stats", "attribute-values"])
          qc.invalidateQueries({ queryKey: [k] });
        if (result.applied) toast.success("Members imported");
      } else setChecked(result);
    } catch {
      toast.error("The file couldn't be checked. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv(memberDefs, homeChapterNational)], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "members-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const targetOptions: { value: ImportTarget; label: string }[] = [
    ...(Object.keys(TARGET_LABELS) as (keyof typeof TARGET_LABELS)[])
      .filter((t) => t !== "chapter" || homeChapterNational)
      .map((t) => ({ value: t as ImportTarget, label: TARGET_LABELS[t] })),
    ...memberDefs.map((d) => ({ value: `field:${d.id}` as ImportTarget, label: d.label })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Import members</DialogTitle>
          <DialogDescription>
            From a spreadsheet saved as CSV. You&apos;ll check it before anything is saved, and
            importing the same file again updates those members instead of adding them twice.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
          {done ? (
            <ImportSummary result={done} />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="import-file">Spreadsheet (CSV)</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv,text/csv"
                  // wait for the member fields, so their columns are recognised
                  disabled={defs.isLoading}
                  onChange={onFile}
                />
                <p className="text-sm text-muted-foreground">
                  One member per row, with a heading row. Dates as YYYY-MM-DD. A membership needs
                  its level and, unless it&apos;s lifetime, its paid-through date; no payment is
                  recorded for it.{" "}
                  <button type="button" className="underline" onClick={downloadTemplate}>
                    Download a template
                  </button>
                  .
                </p>
              </div>
              {table && (
                <div className="space-y-2">
                  <h3 className="font-semibold">
                    Match the columns ({rows.length} member{rows.length === 1 ? "" : "s"} in{" "}
                    {fileName})
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {headers.map((h, i) => (
                      <div key={`${h}-${i}`} className="space-y-1">
                        <Label htmlFor={`col-${i}`}>
                          {h || `Column ${i + 1}`}{" "}
                          <span className="font-normal text-muted-foreground">
                            e.g. {table[1]?.[i] || "—"}
                          </span>
                        </Label>
                        <Select
                          value={targets[i] ?? "ignore"}
                          onValueChange={(v) => {
                            const next = targets.map((t, j) =>
                              j === i
                                ? (v as ImportTarget)
                                : t === v && v !== "ignore"
                                  ? "ignore"
                                  : t,
                            );
                            setTargets(next);
                            setChecked(null);
                          }}
                        >
                          <SelectTrigger id={`col-${i}`} aria-label={`Column ${h || i + 1}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {targetOptions.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  {!mapsNameOrEmail && (
                    <p className="text-sm text-destructive">Match a column to Name or Email.</p>
                  )}
                </div>
              )}
              {checked && <CheckResult result={checked} />}
            </>
          )}
        </div>
        <DialogFooter>
          {done ? (
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={!table || !mapsNameOrEmail || busy}
                onClick={() => void run(false)}
              >
                {busy && !checked ? "Checking…" : "Check the file"}
              </Button>
              <Button
                disabled={!checked || checked.errors.length > 0 || busy}
                onClick={() => void run(true)}
              >
                {busy && checked
                  ? "Importing…"
                  : `Import ${rows.length} member${rows.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckResult({ result }: { result: ImportResult }) {
  if (result.errors.length === 0)
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      >
        Ready to import: {result.create} new, {result.update} already here (they&apos;ll be
        updated).
      </p>
    );
  return (
    <div role="alert" className="space-y-2 rounded-md border border-destructive/50 p-3 text-sm">
      <p className="font-medium">
        {result.errors.length} row{result.errors.length === 1 ? " needs" : "s need"} fixing before
        anything can be imported:
      </p>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto">
        {result.errors.slice(0, 200).map((e) => (
          <li key={e.row}>
            Row {e.row}: {e.message}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Fix them in the spreadsheet, then choose the file again.
      </p>
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  return result.applied ? (
    <p role="status">
      Imported {result.rows} member{result.rows === 1 ? "" : "s"}: {result.create} added and{" "}
      {result.update} updated. The Audit log records the import.
    </p>
  ) : (
    <div role="alert" className="space-y-1">
      <p>
        Part of the file was imported ({result.create} added, {result.update} updated) before a
        batch had errors. Fix the rows below and import the same file again: members already
        imported are updated, not added twice.
      </p>
      <ul>
        {result.errors.slice(0, 50).map((e) => (
          <li key={e.row}>
            Row {e.row}: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
