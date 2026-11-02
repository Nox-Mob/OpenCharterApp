import { db } from "@/lib/db/pending-schema";
import { tableCsv } from "@/modules/reports/rollups";
import { formatPrice } from "@/modules/membership/tiers";

/**
 * Transaction CSV export (A3, D-047, D-173). public.export_payments returns paid and refunded
 * payments in a date range, for one org or its whole tree, and audits the export before any row
 * leaves the database. Amounts stay in minor units in the data and are written as decimals here.
 */
export type ExportedPayment = {
  org_name: string;
  received_on: string;
  member: string;
  email: string;
  purpose: string;
  level: string;
  term: string;
  amount_minor: number;
  refunded_minor: number;
  net_minor: number;
  currency: string;
  status: string;
  method: string;
  gateway: string;
  test_payment: boolean;
  reference: string;
  receipt: string;
  tax_treatment: string;
};

export const PAYMENT_EXPORT_HEADER = [
  "Organization",
  "Date",
  "Member",
  "Email",
  "Purpose",
  "Level",
  "Term",
  "Amount",
  "Refunded",
  "Net",
  "Currency",
  "Status",
  "Method",
  "Gateway",
  "Test payment",
  "Reference",
  "Receipt",
  "Tax treatment",
] as const;

/** "25.00" for 2500 minor units (no currency symbol, so spreadsheets read it as a number). */
export function decimalAmount(minor: number, currency: string): string {
  const digits =
    new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return (minor / 10 ** digits).toFixed(digits);
}

export function paymentsCsv(rows: readonly ExportedPayment[]): string {
  return tableCsv(
    PAYMENT_EXPORT_HEADER,
    rows.map((r) => [
      r.org_name,
      r.received_on,
      r.member,
      r.email,
      r.purpose,
      r.level,
      r.term,
      decimalAmount(r.amount_minor, r.currency),
      decimalAmount(r.refunded_minor, r.currency),
      decimalAmount(r.net_minor, r.currency),
      r.currency,
      r.status,
      r.method,
      r.gateway,
      r.test_payment ? "yes" : "no",
      r.reference,
      r.receipt,
      r.tax_treatment,
    ]),
  );
}

/** Net totals per currency, for the confirmation message. */
export function exportSummary(rows: readonly ExportedPayment[]): string {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + r.net_minor);
  const totals = [...by].map(([c, n]) => formatPrice(n, c)).join(" · ");
  return `${rows.length} payment${rows.length === 1 ? "" : "s"}${totals ? `, net ${totals}` : ""}`;
}

export async function exportPayments(
  orgId: string,
  from: string,
  to: string,
  includeBelow: boolean,
): Promise<ExportedPayment[]> {
  const { data, error } = await db.rpc("export_payments", {
    _org: orgId,
    _from: from,
    _to: to,
    _include_below: includeBelow,
  });
  if (error) throw error;
  return (data ?? []) as ExportedPayment[];
}
