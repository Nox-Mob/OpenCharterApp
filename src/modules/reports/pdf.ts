// The Reports tab as one PDF (S-13): members, revenue and boards, each a table. For a board
// package in OpenBoardApp or to keep. Letter pages; long tables continue on the next page.
import { jsPDF } from "jspdf";

export type ReportSection = { heading: string; header: string[]; rows: (string | number)[][] };

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;

export function reportsPdf(p: {
  organization: string;
  subtitle: string;
  sections: ReportSection[];
}): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  doc.setProperties({ title: `${p.organization} — Reports`, creator: "OpenCharterApp" });
  let y = MARGIN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`${p.organization}: reports`, MARGIN, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(p.subtitle, MARGIN, y + 30);
  y += 54;

  const width = PAGE_W - 2 * MARGIN;
  for (const section of p.sections) {
    if (y > PAGE_H - 140) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(section.heading, MARGIN, y + 10);
    y += 22;
    // First column wider (the organization's name); the rest share what's left.
    const n = section.header.length;
    const first = Math.min(190, width * 0.34);
    const rest = n > 1 ? (width - first) / (n - 1) : 0;
    const colX = (i: number) => MARGIN + (i === 0 ? 0 : first + rest * (i - 1));
    const colW = (i: number) => (i === 0 ? first : rest);
    const drawRow = (cells: (string | number)[], bold: boolean) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(7.5);
      const wrapped = cells.map(
        (c, i) => doc.splitTextToSize(String(c ?? ""), colW(i) - 6) as string[],
      );
      const lines = Math.max(...wrapped.map((w) => w.length), 1);
      const h = lines * 9 + 6;
      if (y + h > PAGE_H - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      wrapped.forEach((w, i) => {
        const right = i > 0 && typeof cells[i] === "number";
        doc.text(
          w,
          right ? colX(i) + colW(i) - 3 : colX(i) + 3,
          y + 10,
          right ? { align: "right" } : {},
        );
      });
      y += h;
      doc.setDrawColor(215, 215, 215);
      doc.line(MARGIN, y, MARGIN + width, y);
    };
    drawRow(section.header, true);
    if (section.rows.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("Nothing to show.", MARGIN + 3, y + 12);
      y += 18;
    }
    for (const r of section.rows) drawRow(r, false);
    y += 18;
  }
  return doc;
}
