import { useEffect, useState } from "react";
import { useReadOnly } from "@/lib/use-billing";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { myOrgsQuery, myPermissionsQuery } from "@/lib/orgs";
import { hasPermission } from "@/lib/policy";
import { logoUrl } from "@/modules/branding";
import {
  receiptErrorMessage,
  receiptQuery,
  receiptSummary,
  reissueReceipt,
  replacementQuery,
  voidReceipt,
} from "@/modules/receipts";
import { RequiresDatabase } from "@/components/db/requires-database";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/receipts/$receiptId")({
  head: () => ({
    meta: [{ title: "Receipt — OpenCharterApp" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequiresDatabase feature="receipts">
      <ReceiptPage />
    </RequiresDatabase>
  ),
});

/** A printable receipt (E-15). Everything shown comes from the receipt's frozen snapshot. */
function ReceiptPage() {
  const { receiptId } = Route.useParams();
  const qc = useQueryClient();
  const receipt = useQuery(receiptQuery(receiptId));
  const replacement = useQuery({
    ...replacementQuery(receiptId),
    enabled: receipt.data?.status === "superseded",
  });
  const orgs = useQuery(myOrgsQuery());
  const grants = useQuery(myPermissionsQuery());
  const [logo, setLogo] = useState<string | null>(null);
  const path = receipt.data?.snapshot.issuer.logo?.path;
  useEffect(() => {
    if (path) void logoUrl(path).then(setLogo);
  }, [path]);
  // S-05: voiding and reissuing are writes, off while Charter is read-only.
  const unit = orgs.data?.find((o) => o.id === receipt.data?.unit_id);
  const readOnly = useReadOnly(unit?.org_id ?? unit?.id);

  if (receipt.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const r = receipt.data;
  if (!r) return <p className="text-muted-foreground">Receipt not found.</p>;
  const s = r.snapshot;
  const view = receiptSummary(r);
  const org = orgs.data?.find((o) => o.id === r.unit_id);
  const canManage = !!org && !readOnly && hasPermission(grants.data ?? [], "payments.manage", org);

  // Print and download make a PDF of the receipt alone (never a print of the page).
  async function openPdf(mode: "print" | "download") {
    // Open the tab right away (browsers block pop-ups opened after waiting), fill it after.
    const tab = mode === "print" ? window.open("", "_blank") : null;
    try {
      const { receiptPdf, receiptFileName } = await import("@/modules/receipts/pdf");
      const doc = receiptPdf(r!, logo ? await loadLogo(logo) : null);
      if (mode === "download") return void doc.save(receiptFileName(r!));
      doc.autoPrint();
      const url = String(doc.output("bloburl"));
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error(`Couldn't make the PDF: ${(e as Error).message}`);
    }
  }

  async function act(kind: "void" | "reissue") {
    const reason = window.prompt(kind === "void" ? "Why is this receipt void?" : "Why reissue it?");
    if (reason === null) return;
    try {
      if (kind === "void") {
        await voidReceipt(r!.id, reason);
        toast.success("Receipt voided");
      } else {
        const id = await reissueReceipt(r!.id, reason);
        toast.success("New receipt issued");
        window.location.assign(`/receipts/${id}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ["receipt", r!.id] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
    } catch (e) {
      toast.error(receiptErrorMessage(String((e as Error).message)));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => void openPdf("print")}>Print</Button>
        <Button variant="outline" onClick={() => void openPdf("download")}>
          Download PDF
        </Button>
        {canManage && r.status === "issued" && (
          <>
            <Button variant="outline" onClick={() => act("reissue")}>
              Reissue
            </Button>
            <Button variant="outline" onClick={() => act("void")}>
              Void
            </Button>
          </>
        )}
      </div>
      <article className="relative space-y-6 rounded-md border bg-white p-8 text-black print:border-0 print:p-0">
        {view.banner && (
          <p className="rounded border-2 border-red-700 p-2 text-center font-semibold uppercase tracking-wide text-red-700">
            {view.banner}
            {r.void_reason ? `: ${r.void_reason}` : ""}
          </p>
        )}
        {r.status === "superseded" && replacement.data && (
          <p className="text-sm print:hidden">
            Replaced by{" "}
            <Link
              to="/receipts/$receiptId"
              params={{ receiptId: replacement.data.id }}
              className="underline"
            >
              receipt {replacement.data.number}
            </Link>
            .
          </p>
        )}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{view.title}</h1>
            <p className="text-sm">{s.issuer.name}</p>
            <p className="text-xs text-neutral-600">{view.issuer}</p>
          </div>
          {logo && <img src={logo} alt={`${s.issuer.name} logo`} className="max-h-16 max-w-40" />}
        </header>
        <section className="text-sm">
          <p className="text-neutral-600">Received from</p>
          <p className="font-medium">{s.payer.name || s.payer.email || "Member"}</p>
          {s.payer.email && s.payer.name && <p>{s.payer.email}</p>}
          <p className="mt-2">{view.received}</p>
          <p className="text-neutral-600">Issued {new Date(r.issued_at).toLocaleDateString()}</p>
        </section>
        <table className="w-full text-sm">
          <tbody>
            {view.items.map((i) => (
              <tr key={i.description} className="border-b">
                <td className="py-2">{i.description}</td>
                <td className="py-2 text-right">{i.amount}</td>
              </tr>
            ))}
            {view.refunded && (
              <tr className="border-b">
                <td className="py-2">Refunded</td>
                <td className="py-2 text-right">−{view.refunded}</td>
              </tr>
            )}
            <tr>
              <td className="py-2 font-semibold">Total received</td>
              <td className="py-2 text-right font-semibold">{view.total}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-sm">{s.tax_wording}</p>
        {s.footer && <p className="text-sm text-neutral-700">{s.footer}</p>}
        <p className="text-xs text-neutral-500">
          {s.issuer.legal_name} issued this receipt. Keep it for your records.
        </p>
      </article>
    </div>
  );
}

/** The receipt's logo as a data URL with its size, for the PDF; null if it can't be read. */
async function loadLogo(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, ...size };
  } catch {
    return null;
  }
}
