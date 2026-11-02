import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { db as supabase } from "@/lib/db/pending-schema";
import type { MembershipStatus } from "./standing";
import { readAllPages } from "@/lib/db/pages";

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
  /** The org the record belongs to; set by treeMembersQuery (several orgs in one list). */
  org_id?: string;
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
    /** Home-chapter model (A8): the chapter this national membership belongs to. */
    home_org_id?: string | null;
    /** True on a chapter record whose membership is the member's national one (A8). */
    via_national?: boolean;
  } | null;
};

const MEMBERSHIP_FIELDS =
  "id,status,paid_through,lifetime,joined_on,tier_id,term_id,membership_tiers(name),tier_terms(label)";
/** The record's own membership, and (0030) the national membership it stands for. */
const OWN_EMBED = `memberships!memberships_profile_id_fkey(${MEMBERSHIP_FIELDS})`;
/** With 0030: the record's own membership including its home chapter. */
const OWN_EMBED_HOME = `memberships!memberships_profile_id_fkey(${MEMBERSHIP_FIELDS},home_org_id)`;
const HOME_EMBED = `home_of,left_at,home:memberships!org_member_profiles_home_of_fkey(${MEMBERSHIP_FIELDS},home_org_id)`;

type MembershipEmbed = {
  id: string;
  home_org_id?: string | null;
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
export const membersQuery = (
  orgId: string,
  withMemberships = true,
  withPrivacy = false,
  withHome = false,
) =>
  queryOptions({
    queryKey: ["members", orgId, withMemberships, withPrivacy, withHome],
    queryFn: async (): Promise<MemberRow[]> => {
      if (!withMemberships) {
        const data = await readAllPages(
          (from, to) =>
            supabase
              .from("org_member_profiles")
              .select("id,user_id,display_name,email,created_at")
              .eq("org_id", orgId)
              .order("created_at")
              .order("id")
              .range(from, to) as unknown as PromiseLike<{
              data: Omit<MemberRow, "source" | "membership">[] | null;
              error: unknown;
            }>,
        );
        return data.map((p) => ({ ...p, source: "signup", membership: null }));
      }
      // directory_listed only exists once migration 0012 is applied (readiness guard).
      // home_of / left_at and the national membership exist once 0030 is applied (A8).
      const base = "id,user_id,display_name,email,source,created_at";
      const cols = [
        base,
        withPrivacy && "directory_listed",
        withHome ? OWN_EMBED_HOME : OWN_EMBED,
        withHome && HOME_EMBED,
      ]
        .filter(Boolean)
        .join(",");
      // Paged: the API returns at most 1000 rows per request (R6, large chapters).
      const rows = await readAllPages<EmbedRow>((from, to) => {
        let q = supabase.from("org_member_profiles").select(cols).eq("org_id", orgId);
        // members who moved to another chapter aren't listed here any more
        if (withHome) q = q.is("left_at", null);
        return q.order("created_at").order("id").range(from, to) as unknown as PromiseLike<{
          data: EmbedRow[] | null;
          error: unknown;
        }>;
      });
      return rows.map(toMemberRow);
    },
  });

type EmbedRow = Omit<MemberRow, "membership"> & {
  memberships: unknown;
  home?: unknown;
  home_of?: string | null;
  left_at?: string | null;
};

function toMembership(
  m: MembershipEmbed,
  viaNational: boolean,
): NonNullable<MemberRow["membership"]> {
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
    ...(m.home_org_id !== undefined ? { home_org_id: m.home_org_id } : {}),
    ...(viaNational ? { via_national: true } : {}),
  };
}

/** The record's own membership, else (home-chapter model) the national one it stands for. */
export function toMemberRow({
  memberships,
  home,
  home_of: _h,
  left_at: _l,
  ...p
}: EmbedRow): MemberRow {
  const own = ((memberships ?? []) as unknown as MembershipEmbed[])[0];
  const national = (home ?? null) as MembershipEmbed | null;
  return {
    ...p,
    membership: own ? toMembership(own, false) : national ? toMembership(national, true) : null,
  };
}

/** A column or relationship this database doesn't have yet (a migration not applied). */
export function isMissingColumnError(e: { code?: string; message?: string }): boolean {
  return (
    ["42703", "PGRST200", "PGRST204"].includes(e.code ?? "") ||
    /does not exist|could not find a relationship/i.test(e.message ?? "")
  );
}

export { readAllPages };

/**
 * Every member record in several orgs at once (D-154): a national or region admin's list of
 * everyone in their org and the orgs below it. members.view inherits downward (D-032), so RLS
 * already lets them read these rows; a chapter admin asking for a sibling gets nothing back.
 */
export const treeMembersQuery = (orgIds: readonly string[]) =>
  queryOptions({
    queryKey: ["members-tree", ...orgIds],
    enabled: orgIds.length > 0,
    queryFn: async (): Promise<MemberRow[]> => {
      const rows = await readAllPages<EmbedRow>(
        (from, to) =>
          supabase
            .from("org_member_profiles")
            .select(
              "id,org_id,user_id,display_name,email,source,created_at,directory_listed,memberships!memberships_profile_id_fkey(id,status,paid_through,lifetime,joined_on,tier_id,term_id,membership_tiers(name),tier_terms(label))",
            )
            .in("org_id", [...orgIds])
            .order("created_at")
            .order("id")
            .range(from, to) as unknown as PromiseLike<{ data: EmbedRow[] | null; error: unknown }>,
      );
      return rows.map(toMemberRow);
    },
  });

/** Grace days for each org in a list (standing differs by org). */
export const graceDaysByOrgQuery = (orgIds: readonly string[]) =>
  queryOptions({
    queryKey: ["grace-days-by-org", ...orgIds],
    enabled: orgIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const entries = await Promise.all(
        orgIds.map(async (id) => {
          const { data, error } = await supabase.rpc("grace_days", { _org: id });
          if (error) throw error;
          return [id, typeof data === "number" ? data : 30] as const;
        }),
      );
      return Object.fromEntries(entries);
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
    [
      "national membership isn't active",
      "Their national membership isn't active yet. Approve it at the national first.",
    ],
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
      const read = (cols: string) =>
        supabase
          .from("org_member_profiles")
          .select(cols)
          .eq("org_id", orgId)
          .eq("user_id", u.user!.id)
          .maybeSingle();
      // With 0030 a chapter record may stand for the national membership (A8); before it, the
      // extra columns don't exist, so read the record's own membership only.
      let res = await read(`id,${OWN_EMBED_HOME},${HOME_EMBED}`);
      if (res.error && isMissingColumnError(res.error)) res = await read(`id,${OWN_EMBED}`);
      if (res.error) throw res.error;
      const data = res.data as unknown as EmbedRow | null;
      if (!data || data.left_at) return null;
      return toMemberRow({ ...data }).membership;
    },
  });
