import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { db as supabase } from "@/lib/db/pending-schema";
import type { MembershipStatus } from "./standing";

/**
 * Memberships (E-13a). Reads go through RLS; every write goes through a definer RPC
 * (admin_create_member, record_membership, approve/decline/cancel_membership) so the
 * stacking rule, payment permission and history are enforced in one place.
 */
export const PAYMENT_METHODS = ["cash", "check", "card", "bank_transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  card: "Card (outside the app)",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export type MemberRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  email: string;
  source: string;
  created_at: string;
  /** The member's own directory choice; null = the org default; undefined = not loaded (0012). */
  directory_listed?: boolean | null;
  membership: {
    id: string;
    status: MembershipStatus;
    paid_through: string | null;
    lifetime: boolean;
    joined_on: string | null;
    tier_id: string;
    term_id: string;
    tier_name: string;
    term_label: string;
  } | null;
};

type MembershipEmbed = {
  id: string;
  status: MembershipStatus;
  paid_through: string | null;
  lifetime: boolean;
  joined_on: string | null;
  tier_id: string;
  term_id: string;
  membership_tiers: { name: string } | null;
  tier_terms: { label: string } | null;
};

/**
 * The member list. Without migration 0008 (see src/lib/db/readiness.ts) it reads only the
 * columns that exist today, and every member shows as having no membership.
 */
export const membersQuery = (orgId: string, withMemberships = true, withPrivacy = false) =>
  queryOptions({
    queryKey: ["members", orgId, withMemberships, withPrivacy],
    queryFn: async (): Promise<MemberRow[]> => {
      if (!withMemberships) {
        const { data, error } = await supabase
          .from("org_member_profiles")
          .select("id,user_id,display_name,email,created_at")
          .eq("org_id", orgId)
          .order("created_at");
        if (error) throw error;
        return (data ?? []).map((p) => ({ ...p, source: "signup", membership: null }));
      }
      // directory_listed only exists once migration 0012 is applied (readiness guard).
      const base = "id,user_id,display_name,email,source,created_at";
      const embed =
        "memberships(id,status,paid_through,lifetime,joined_on,tier_id,term_id,membership_tiers(name),tier_terms(label))";
      const { data, error } = await supabase
        .from("org_member_profiles")
        .select(withPrivacy ? `${base},directory_listed,${embed}` : `${base},${embed}`)
        .eq("org_id", orgId)
        .order("created_at");
      if (error) throw error;
      type Row = Omit<MemberRow, "membership"> & { memberships: unknown };
      return ((data ?? []) as unknown as Row[]).map(({ memberships, ...p }) => {
        const m = ((memberships ?? []) as unknown as MembershipEmbed[])[0];
        return {
          ...p,
          membership: m
            ? {
                id: m.id,
                status: m.status,
                paid_through: m.paid_through,
                lifetime: m.lifetime,
                joined_on: m.joined_on,
                tier_id: m.tier_id,
                term_id: m.term_id,
                tier_name: m.membership_tiers?.name ?? "",
                term_label: m.tier_terms?.label ?? "",
              }
            : null,
        };
      });
    },
  });

/** The org's grace period in days (resolved through the hierarchy by public.grace_days). */
export const graceDaysQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["grace-days", orgId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("grace_days", { _org: orgId });
      if (error) throw error;
      return typeof data === "number" ? data : 30;
    },
  });

export type MembershipEvent = {
  id: number;
  kind: "joined" | "renewed" | "approved" | "declined" | "cancelled";
  period_start: string | null;
  period_end: string | null;
  note: string;
  created_at: string;
  tier_name: string;
  term_label: string;
  payment: { id: string; amount_minor: number; currency: string; method: string | null } | null;
};

export const membershipHistoryQuery = (membershipId: string) =>
  queryOptions({
    queryKey: ["membership-history", membershipId],
    queryFn: async (): Promise<MembershipEvent[]> => {
      const { data, error } = await supabase
        .from("membership_events")
        .select(
          "id,kind,period_start,period_end,note,created_at,membership_tiers(name),tier_terms(label),payments(id,amount_minor,currency,method)",
        )
        .eq("membership_id", membershipId)
        .order("id", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((e) => {
        const x = e as unknown as {
          membership_tiers: { name: string } | null;
          tier_terms: { label: string } | null;
          payments: MembershipEvent["payment"];
        };
        return {
          id: e.id,
          kind: e.kind,
          period_start: e.period_start,
          period_end: e.period_end,
          note: e.note,
          created_at: e.created_at,
          tier_name: x.membership_tiers?.name ?? "",
          term_label: x.tier_terms?.label ?? "",
          payment: x.payments ?? null,
        };
      });
    },
  });

export const memberRecordSchema = z.object({
  display_name: z.string().trim().min(1, "Give the member a name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email"),
});
export type MemberRecordInput = z.infer<typeof memberRecordSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const recordMembershipSchema = z.object({
  term_id: z.string().uuid("Pick a membership level and term"),
  paid_on: isoDate,
  /** null = no payment recorded (e.g. a complimentary membership). */
  amount_minor: z.number().int().min(0).max(100000000).nullable(),
  method: z.enum(PAYMENT_METHODS).nullable(),
  note: z.string().trim().max(500),
  /** Only for entering historical members; otherwise the stacking rule picks the start. */
  starts_on: isoDate.nullable(),
});
export type RecordMembershipInput = z.infer<typeof recordMembershipSchema>;

export async function createMemberRecord(orgId: string, input: MemberRecordInput) {
  const v = memberRecordSchema.parse(input);
  const { data, error } = await supabase.rpc("admin_create_member", {
    _org: orgId,
    _display_name: v.display_name,
    _email: v.email,
  });
  if (error) throw error;
  return data as string;
}

export async function updateMemberRecord(profileId: string, input: MemberRecordInput) {
  const v = memberRecordSchema.parse(input);
  const { error } = await supabase.rpc("update_member_record", {
    _profile: profileId,
    _display_name: v.display_name,
    _email: v.email,
  });
  if (error) throw error;
}

export async function recordMembership(profileId: string, input: RecordMembershipInput) {
  const v = recordMembershipSchema.parse(input);
  const { error } = await supabase.rpc("record_membership", {
    _profile: profileId,
    _term: v.term_id,
    _paid_on: v.paid_on,
    ...(v.amount_minor !== null ? { _amount_minor: v.amount_minor } : {}),
    ...(v.method ? { _method: v.method } : {}),
    _note: v.note,
    ...(v.starts_on ? { _starts_on: v.starts_on } : {}),
  });
  if (error) throw error;
}

export async function decideMembership(
  membershipId: string,
  action: "approve" | "decline" | "cancel",
  note = "",
) {
  const fn =
    action === "approve"
      ? "approve_membership"
      : action === "decline"
        ? "decline_membership"
        : "cancel_membership";
  const { error } = await supabase.rpc(fn, { _membership: membershipId, _note: note });
  if (error) throw error;
}

/** Friendly text for errors raised by the membership RPCs. */
export function membershipErrorMessage(message: string): string {
  const known: [string, string][] = [
    ["already a member", "Someone with that email is already a member"],
    ["invalid email", "Enter a valid email"],
    ["give the member a name", "Give the member a name"],
    ["lifetime member", "This person is already a lifetime member"],
    ["isn't offered here", "That membership level isn't offered by this organization"],
    ["retired", "That membership level is retired"],
    ["approve or decline", "Approve or decline the pending application first"],
    ["not allowed to record payments", "You can record memberships but not payments"],
    ["manages their own", "This member manages their own name and email"],
    ["only pending", "Only pending applications can be approved or declined"],
    ["only active", "Only active memberships can be cancelled"],
  ];
  return known.find(([k]) => message.includes(k))?.[1] ?? "Couldn't save the membership";
}

/** The signed-in person's own membership in an org (null when they have none). */
export const myMembershipQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["my-membership", orgId],
    queryFn: async (): Promise<MemberRow["membership"] | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("org_member_profiles")
        .select(
          "id,memberships(id,status,paid_through,lifetime,joined_on,tier_id,term_id,membership_tiers(name),tier_terms(label))",
        )
        .eq("org_id", orgId)
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      const m = ((data?.memberships ?? []) as unknown as MembershipEmbed[])[0];
      if (!m) return null;
      return {
        id: m.id,
        status: m.status,
        paid_through: m.paid_through,
        lifetime: m.lifetime,
        joined_on: m.joined_on,
        tier_id: m.tier_id,
        term_id: m.term_id,
        tier_name: m.membership_tiers?.name ?? "",
        term_label: m.tier_terms?.label ?? "",
      };
    },
  });
