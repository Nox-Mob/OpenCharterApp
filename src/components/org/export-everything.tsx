// "Export everything" (S-06): a zip of every Charter table for this organization and the
// chapters below it (CSV per table plus one JSON file). Reading only, so it stays on while the
// plan makes Charter read-only.
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db/pending-schema";
import type { Org } from "@/lib/orgs";
import {
  buildExportZip,
  exportFileName,
  readEverything,
  type ExportClient,
} from "@/modules/export/everything";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ExportEverything({ org, orgs }: { org: Org; orgs: readonly Org[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const unitIds = [org.id, ...orgs.filter((o) => o.ancestor_ids.includes(org.id)).map((o) => o.id)];

  async function run() {
    setBusy("Starting…");
    try {
      const data = await readEverything(db as unknown as ExportClient, unitIds, (t) =>
        setBusy(`Reading ${t.replace(/_/g, " ")}…`),
      );
      const now = new Date();
      const zip = buildExportZip(data, {
        organization: org.name,
        organizationId: org.id,
        exportedAt: now.toISOString(),
      });
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(org.slug || org.name, now.toISOString().slice(0, 10));
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Export everything</CardTitle>
        <CardDescription>
          Every member, membership, level, payment, receipt, board seat and setting for {org.name}
          {unitIds.length > 1 ? ` and its ${unitIds.length - 1} chapters` : ""}, as a zip with one
          spreadsheet (CSV) per table and one JSON file. It works even when the app is read-only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => void run()} disabled={!!busy}>
          {busy ?? "Download export (.zip)"}
        </Button>
      </CardContent>
    </Card>
  );
}
