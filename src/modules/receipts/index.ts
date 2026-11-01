import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import { formatPrice } from "@/modules/membership/tiers";

/**
 * Receipts (E-15, D-044, D-140). Issued by the database when a payment is paid, immutable,
 * numbered per org and year. Corrections void or reissue (a new version pointing back);
 * refunds void (full) or replace with the net amount (partial). Shown and printed in the app.
 */
export type ReceiptStatus = "issued" | "voided" | "superseded";

export type ReceiptSnapshot = {
  issuer: {
    org_id: string;
    name: string;
    legal_name: string;
    ein: string;
    tax_status: string;
    logo: { path: string; org_id: string } | null;
  };
  payer: { name: string; email: string };
  items: { description: string; amount_minor: number }[];
  amount_minor: number;
  refunded_minor: number;
  net_minor: number;
  currency: string;
  received_on: string;
  method: string;
  livemode: boolean;
  tax_treatment: string;
  tax_wording: string;
  footer: string;
  note: string;
};

export type Receipt = {
  id: string;
  org_id: string;
  payment_id: string;
  number: string;
  status: ReceiptStatus;
  supersedes_id: string | null;
  issued_at: string;
  voided_at: string | null;
  void_reason: string | null;
  snapshot: ReceiptSnapshot;
};

const COLUMNS =
  "id,org_id,payment_id,number,status,supersedes_id,issued_at,voided_at,void_reason,snapshot" as const;
const toReceipt = (r: Record<string, unknown>) => r as unknown as Receipt;

export const receiptQuery = (id: string) =>
  queryOptions({
    queryKey: ["receipt", id],
    queryFn: async (): Promise<Receipt | null> => {
      const { data, error } = await db.from("receipts").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? toReceipt(data) : null;
    },
  });

/** The receipt that replaced this one, if any (for the "Replaced by" banner). */
export const replacementQuery = (id: string) =>
  queryOptions({
    queryKey: ["receipt-replacement", id],
    queryFn: async (): Promise<{ id: string; number: string } | null> => {
      const { data, error } = await db
        .from("receipts")
        .select("id,number")
        .eq("supersedes_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Current receipt per payment for an org (payments tab, membership history). */
export const orgReceiptsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["receipts", "org", orgId],
    queryFn: async (): Promise<Record<string, { id: string; number: string }>> => {
      const { data, error } = await db
        .from("receipts")
        .select("id,number,payment_id")
        .eq("org_id", orgId)
        .eq("status", "issued");
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((r) => [r.payment_id, { id: r.id, number: r.number }]),
      );
    },
  });

/** The signed-in member's own receipts in an org (also correct for admins, who see more). */
export const myReceiptsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["receipts", "mine", orgId],
    queryFn: async (): Promise<Receipt[]> => {
      const { data: u } = await db.auth.getUser();
      if (!u.user) return [];
      const { data: me } = await db
        .from("org_member_profiles")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!me) return [];
      const profileId = me.id;
      const { data, error } = await db
        .from("receipts")
        .select(`${COLUMNS},payments!inner(profile_id)`)
        .eq("org_id", orgId)
        .eq("payments.profile_id", profileId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => toReceipt(r as Record<string, unknown>));
    },
  });

export async function voidReceipt(id: string, reason: string) {
  const { error } = await db.rpc("void_receipt", { _receipt: id, _reason: reason });
  if (error) throw error;
}

export async function reissueReceipt(id: string, reason: string) {
  const { data, error } = await db.rpc("reissue_receipt", { _receipt: id, _reason: reason });
  if (error) throw error;
  return data as string;
}

export const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
  test: "Test payment",
};

/** The lines a receipt shows, in order (shared by the page and tests). */
export function receiptSummary(r: Pick<Receipt, "number" | "status" | "snapshot">) {
  const s = r.snapshot;
  const money = (m: number) => formatPrice(m, s.currency);
  return {
    title: s.livemode ? `Receipt ${r.number}` : `Test receipt ${r.number}`,
    issuer: [s.issuer.legal_name, s.issuer.ein ? `EIN ${s.issuer.ein}` : "", s.issuer.tax_status]
      .filter(Boolean)
      .join(" · "),
    received: `Received ${s.received_on} by ${METHOD_LABELS[s.method] ?? s.method}`,
    items: s.items.map((i) => ({ description: i.description, amount: money(i.amount_minor) })),
    refunded: s.refunded_minor > 0 ? money(s.refunded_minor) : null,
    total: money(s.net_minor),
    banner:
      r.status === "voided"
        ? "VOID"
        : r.status === "superseded"
          ? "REPLACED"
          : s.livemode
            ? null
            : "TEST: no real money moved",
  };
}

export function receiptErrorMessage(message: string): string {
  if (message.includes("give a reason")) return "Give a reason";
  if (message.includes("only issued") || message.includes("only the current"))
    return "Only the current receipt can be changed";
  if (message.includes("already has a receipt")) return "This payment already has a receipt";
  return "Couldn't update the receipt";
}
