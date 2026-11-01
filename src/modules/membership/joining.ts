import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import type { AttributeType } from "@/engines/attributes";
import type { TermUnit } from "./tiers";

/**
 * Online joining and renewal (E-13b). The public page reads public_join_info; joining and
 * renewing create a pending payment (begin_join / begin_renewal) and open the org's checkout.
 * The membership itself is created by the payment's completion, never by the browser.
 */
export type JoinTerm = {
  id: string;
  label: string;
  length_count: number | null;
  length_unit: TermUnit | null;
  price_minor: number;
  currency: string;
};
export type JoinLevel = { id: string; name: string; description: string; terms: JoinTerm[] };
export type JoinField = {
  id: string;
  label: string;
  help: string;
  data_type: AttributeType;
  required: boolean;
  options: { value: string; label: string }[];
};
export type JoinInfo = {
  org: { id: string; name: string; slug: string; type: string };
  levels_managed_by_parent: boolean;
  parent: { name: string; slug: string } | null;
  payments_enabled: boolean;
  gateway: "stripe" | "test" | null;
  livemode: boolean;
  approval_required: boolean;
  levels: JoinLevel[];
  fields: JoinField[];
};

export const joinInfoQuery = (slug: string) =>
  queryOptions({
    queryKey: ["join-info", slug.toLowerCase()],
    queryFn: async (): Promise<JoinInfo | null> => {
      const { data, error } = await db.rpc("public_join_info", { _slug: slug });
      if (error) throw error;
      return (data as unknown as JoinInfo | null) ?? null;
    },
  });

/** Why the join page can't take a payment, or null when it can. */
export function joinBlocker(info: JoinInfo): string | null {
  if (info.levels_managed_by_parent)
    return `${info.org.name} uses ${info.parent?.name ?? "its parent organization"}'s membership levels.`;
  if (info.levels.every((l) => l.terms.length === 0))
    return `${info.org.name} hasn't set up membership levels yet.`;
  if (!info.payments_enabled) return "Online joining isn't open yet.";
  return null;
}

/** Answers keyed by field id; empty values are left out so optional fields stay blank. */
export function joinAnswers(fields: readonly JoinField[], draft: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = draft[f.id];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[f.id] = v;
  }
  return out;
}

export async function beginJoin(orgId: string, termId: string, answers: Record<string, unknown>) {
  const { data, error } = await db.rpc("begin_join", {
    _org: orgId,
    _term: termId,
    _answers: answers as never,
  });
  if (error) throw error;
  return data as string;
}

export async function beginRenewal(membershipId: string, termId: string) {
  const { data, error } = await db.rpc("begin_renewal", {
    _membership: membershipId,
    _term: termId,
  });
  if (error) throw error;
  return data as string;
}

export async function completeTestPayment(paymentId: string, outcome: string) {
  const { data, error } = await db.rpc("complete_test_payment", {
    _payment: paymentId,
    _outcome: outcome,
  });
  if (error) throw error;
  return String(data);
}

export type PaymentProgress = {
  id: string;
  status: "pending" | "paid" | "refunded" | "failed";
  failure_reason: string | null;
  purpose: "join" | "renew";
  amount_minor: number;
  currency: string;
  gateway: "manual" | "stripe" | "test";
  livemode: boolean;
  membership_status: "pending" | "active" | "cancelled" | "declined" | null;
  org_name: string;
  org_slug: string;
};

export const paymentProgressQuery = (paymentId: string) =>
  queryOptions({
    queryKey: ["payment-progress", paymentId],
    queryFn: async (): Promise<PaymentProgress | null> => {
      const { data, error } = await db
        .from("payments")
        .select(
          "id,status,failure_reason,purpose,amount_minor,currency,gateway,livemode,memberships(status),organizations(name,slug)",
        )
        .eq("id", paymentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { memberships, organizations, ...p } = data as typeof data & {
        memberships: { status: PaymentProgress["membership_status"] } | null;
        organizations: { name: string; slug: string } | null;
      };
      return {
        ...p,
        membership_status: memberships?.status ?? null,
        org_name: organizations?.name ?? "",
        org_slug: organizations?.slug ?? "",
      };
    },
  });

export type JoinOutcome =
  "waiting" | "welcome" | "renewed" | "awaiting_approval" | "failed" | "refunded" | "missing";

/** What the return page shows. The browser never decides; it waits for the webhook. */
export function joinOutcome(p: PaymentProgress | null | undefined): JoinOutcome {
  if (!p) return "missing";
  if (p.status === "failed") return "failed";
  if (p.status === "refunded") return "refunded";
  if (p.status === "pending") return "waiting";
  if (p.membership_status === "pending") return "awaiting_approval";
  if (p.membership_status === "active") return p.purpose === "renew" ? "renewed" : "welcome";
  return "waiting";
}

/** Friendly text for errors from the joining RPCs. */
export function joinErrorMessage(message: string): string {
  const known: [string, string][] = [
    ["is required", ""],
    ["renew instead", "You're already a member. Renew from your membership instead."],
    ["already waiting", "Your application is already waiting for approval."],
    ["aren't open yet", "Online payments aren't open for this organization yet."],
    ["isn't offered here", "That membership level isn't offered anymore."],
    ["invalid value", "One of your answers isn't valid. Check the form."],
    ["lifetime member", "You're already a lifetime member."],
  ];
  const hit = known.find(([k]) => message.includes(k));
  if (hit && hit[1] === "") return message.charAt(0).toUpperCase() + message.slice(1);
  return hit?.[1] ?? "Something went wrong. Please try again.";
}
