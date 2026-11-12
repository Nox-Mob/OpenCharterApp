// A receipt as a PDF (owner request, 2026-11-12): printed or saved, it is the receipt alone, laid
// out on a Letter page, never a print of the app's screen. Everything comes from the receipt's
// frozen snapshot (receiptSummary), so the PDF matches what was issued.
import { jsPDF } from "jspdf";
import { receiptSummary, type Receipt } from "./index";

export type ReceiptLogo = { dataUrl: string; width: number; height: number };

const PAGE_W = 612; // Letter, in points
const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN;

export function receiptPdf(
  r: Pick<Receipt, "number" | "status" | "snapshot" | "issued_at" | "void_reason">,
  logo?: ReceiptLogo | null,
): jsPDF {
  const s = r.snapshot;
  const view = receiptSummary(r);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setProperties({ title: `${view.title} — ${s.issuer.name}`, creator: "OpenCharterApp" });
  let y = MARGIN;

  if (view.banner) {
    doc.setDrawColor(185, 28, 28);
    doc.setTextColor(185, 28, 28);
    doc.setLineWidth(1.5);
    doc.rect(MARGIN, y, RIGHT - MARGIN, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const banner = view.banner + (r.void_reason ? `: ${r.void_reason}` : "");
    doc.text(banner.toUpperCase(), PAGE_W / 2, y + 17, {
      align: "center",
      maxWidth: RIGHT - MARGIN - 16,
    });
    y += 44;
  }

  // Header: title and issuer on the left, the logo on the right.
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(view.title, MARGIN, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(s.issuer.name, MARGIN, y + 34);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  if (view.issuer) doc.text(view.issuer, MARGIN, y + 48, { maxWidth: 330 });
  if (logo) {
    const h = Math.min(56, (logo.height / logo.width) * 140);
    const w = (logo.width / logo.height) * h;
    try {
      doc.addImage(logo.dataUrl, RIGHT - w, y, w, h);
    } catch {
      // An unreadable logo leaves the receipt without it rather than failing.
    }
  }
  y += 80;

  // Received from.
  doc.setTextColor(90, 90, 90);
  doc.setFontSize(9);
  doc.text("Received from", MARGIN, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(s.payer.name || s.payer.email || "Member", MARGIN, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let line = y + 30;
  if (s.payer.email && s.payer.name) {
    doc.text(s.payer.email, MARGIN, line);
    line += 14;
  }
  doc.text(view.received, MARGIN, line + 6);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Issued ${new Date(r.issued_at).toLocaleDateString("en-US", { dateStyle: "medium" })}`,
    MARGIN,
    line + 20,
  );
  y = line + 46;

  // Items, refund and total.
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.75);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  const row = (label: string, amount: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(label, RIGHT - MARGIN - 110) as string[];
    doc.text(lines, MARGIN, y + 14);
    doc.text(amount, RIGHT, y + 14, { align: "right" });
    y += 10 + lines.length * 12;
    doc.line(MARGIN, y, RIGHT, y);
  };
  doc.line(MARGIN, y, RIGHT, y);
  for (const i of view.items) row(i.description, i.amount);
  if (view.refunded) row("Refunded", `−${view.refunded}`);
  row("Total received", view.total, true);
  y += 24;

  // Tax wording, footer and the issuer's line.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const wrap = (text: string) => {
    const lines = doc.splitTextToSize(text, RIGHT - MARGIN) as string[];
    doc.text(lines, MARGIN, y);
    y += lines.length * 13 + 8;
  };
  if (s.tax_wording) wrap(s.tax_wording);
  if (s.footer) {
    doc.setTextColor(60, 60, 60);
    wrap(s.footer);
  }
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(8);
  wrap(`${s.issuer.legal_name} issued this receipt. Keep it for your records.`);
  return doc;
}

export function receiptFileName(r: Pick<Receipt, "number" | "snapshot">): string {
  const who = r.snapshot.issuer.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${who || "receipt"}-receipt-${r.number}.pdf`;
}
