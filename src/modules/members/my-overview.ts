import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveSetting, type SettingRow } from "@/engines/settings";
import type { MemberRow } from "@/modules/membership/memberships";
import { addDays, daysToExpiration, standing } from "@/modules/membership/standing";
import type { Seat } from "@/modules/governance/seats";

/**
 * What a member sees about themselves on an org's Overview (D-153): actions needed, their
 * profile, their roles and seats, and who to contact. Everything here is data the member can
 * already read (own profile, own role assignments, the org's board and settings), so it needs no
 * new database rules, and it never reaches across orgs (D-036).
 */

export type MyProfile = { id: string; display_name: string; email: string };

/** The signed-in person's member record in this org, or null when they have none. */
export const myProfileQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["my-profile", orgId],
    queryFn: async (): Promise<MyProfile | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("org_member_profiles")
        .select("id,display_name,email")
        .eq("org_id", orgId)
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { id: data.id, display_name: data.display_name ?? "", email: data.email }
        : null;
    },
  });

/** Roles the signed-in person holds in this org (RLS lets everyone read their own). */
export const myRolesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["my-roles", orgId],
    queryFn: async (): Promise<{ id: string; name: string; source: string }[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("role_assignments")
        .select("id,source,roles(name)")
        .eq("org_id", orgId)
        .eq("user_id", u.user.id);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        source: r.source,
        name: (r.roles as { name: string } | null)?.name ?? "",
      }));
    },
  });

/** The org's public contact email (`contact.email`), its own or the nearest parent's. */
export const contactEmailQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["contact-email", orgId],
    queryFn: async (): Promise<{ email: string; fromOrgId: string | null }> => {
      const { data, error } = await supabase.rpc("lineage_settings", { _org: orgId });
      if (error) throw error;
      const r = resolveSetting(
        [...lineage, orgId],
        (data ?? []) as SettingRow[],
        "contact.email",
        "",
      );
      return { email: typeof r.value === "string" ? r.value.trim() : "", fromOrgId: r.sourceOrgId };
    },
  });

// ----- pure helpers -----

export type MySeat = {
  title: string;
  seat_number: number;
  seat_count: number;
  starts_on: string;
  planned_end: string | null;
};

/** The seats a member holds, from the org's board. */
export function mySeats(board: readonly Seat[], profileId: string | null | undefined): MySeat[] {
  if (!profileId) return [];
  return board.flatMap((s) =>
    s.holders
      .filter((h) => h.profile_id === profileId)
      .map((h) => ({
        title: s.title,
        seat_number: h.seat_number,
        seat_count: s.seat_count,
        starts_on: h.starts_on,
        planned_end: h.planned_end,
      })),
  );
}

/** Current officers, seat by seat, for "who to contact". Vacant seats are left out. */
export function officers(board: readonly Seat[]) {
  return board.flatMap((s) =>
    [...s.holders]
      .sort((a, b) => a.seat_number - b.seat_number)
      .map((h) => ({
        key: `${s.template_id}:${h.seat_number}`,
        title: s.title,
        name: h.display_name,
      })),
  );
}

export type ActionTone = "urgent" | "soon" | "info";
export type MemberAction = {
  key: string;
  tone: ActionTone;
  text: string;
  /** What the button does, if there is one. */
  cta?: "join" | "renew" | "profile" | "chapter" | "join_national";
};

/** How many days before the end of a term "renew soon" appears. */
export const RENEW_SOON_DAYS = 30;

/**
 * The to-do list on a member's overview, most urgent first. `membership` is the member's
 * membership here (null when they have a record but no membership); `hasProfile` is false when
 * they have no member record at all.
 */
export function memberActions(input: {
  hasProfile: boolean;
  membership: MemberRow["membership"];
  graceDays: number;
  on: string;
  missingRequired: readonly string[];
  seats: readonly MySeat[];
  /** Home-chapter model (A8): a national member who hasn't picked a chapter yet. */
  noChapter?: boolean;
  /** Separate model with national dues required (A5): the member's national membership. */
  national?: { name: string; state: "current" | "pending" | "none" } | null;
}): MemberAction[] {
  const { membership: m, graceDays, on } = input;
  const out: MemberAction[] = [];
  if (!input.hasProfile) return out;
  const s = standing(m, graceDays, on);
  if (s === "none")
    out.push({
      key: "join",
      tone: "info",
      text: "You don't have a membership here yet.",
      cta: "join",
    });
  else if (s === "pending")
    out.push({ key: "pending", tone: "info", text: "Your application is waiting for approval." });
  else if (s === "cancelled" || s === "declined")
    out.push({
      key: "rejoin",
      tone: "info",
      text: "Your membership has ended. You can join again.",
      cta: "join",
    });
  else if (s === "lapsed")
    out.push({
      key: "lapsed",
      tone: "urgent",
      text: "Your membership has lapsed. Renew to return to good standing.",
      cta: "renew",
    });
  else if (s === "grace" && m?.paid_through)
    out.push({
      key: "grace",
      tone: "urgent",
      text: `Your membership ended on ${m.paid_through}. Renew by ${addDays(m.paid_through, graceDays)} to stay a member.`,
      cta: "renew",
    });
  else if (s === "good") {
    const d = daysToExpiration(m, on);
    if (d !== null && d <= RENEW_SOON_DAYS)
      out.push({
        key: "renew",
        tone: "soon",
        text: `Your membership ends on ${m!.paid_through} (${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}).`,
        cta: "renew",
      });
  }
  if (input.national && input.national.state === "none")
    out.push({
      key: "national",
      tone: "urgent",
      text: `Membership here also needs a current membership of ${input.national.name}. Yours is missing or has lapsed.`,
      cta: "join_national",
    });
  else if (input.national && input.national.state === "pending")
    out.push({
      key: "national-pending",
      tone: "info",
      text: `Your ${input.national.name} membership is waiting for approval.`,
    });
  if (input.noChapter && m && (m.status === "active" || m.status === "pending"))
    out.push({
      key: "chapter",
      tone: "info",
      text: "You haven't picked a chapter. Choose the one you belong to, or stay a member at large.",
      cta: "chapter",
    });
  if (input.missingRequired.length)
    out.push({
      key: "profile",
      tone: "soon",
      text: `Complete your profile: ${input.missingRequired.join(", ")}.`,
      cta: "profile",
    });
  for (const seat of input.seats) {
    if (!seat.planned_end) continue;
    const left = Math.round(
      (Date.parse(`${seat.planned_end}T00:00:00Z`) - Date.parse(`${on}T00:00:00Z`)) / 86_400_000,
    );
    if (left < 0)
      out.push({
        key: `seat-past:${seat.title}:${seat.seat_number}`,
        tone: "info",
        text: `Your term as ${seat.title} was planned to end on ${seat.planned_end}.`,
      });
    else if (left <= RENEW_SOON_DAYS)
      out.push({
        key: `seat:${seat.title}:${seat.seat_number}`,
        tone: "info",
        text: `Your term as ${seat.title} ends on ${seat.planned_end}.`,
      });
  }
  const rank: Record<ActionTone, number> = { urgent: 0, soon: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** Labels of required fields the member may fill in themselves but hasn't. */
export function missingRequiredFields(
  defs: readonly { id: string; label: string; required: boolean; member_editable: boolean }[],
  values: Readonly<Record<string, unknown>>,
): string[] {
  const empty = (v: unknown) =>
    v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  return defs
    .filter((d) => d.required && d.member_editable && empty(values[d.id]))
    .map((d) => d.label);
}

/** A field value as text for the profile summary ("—" when empty). */
export function formatFieldValue(
  def: { data_type: string; options: readonly { value: string; label: string }[] },
  v: unknown,
): string {
  if (v === null || v === undefined || v === "") return "—";
  const label = (x: unknown) => def.options.find((o) => o.value === x)?.label ?? String(x);
  if (def.data_type === "boolean") return v === true ? "Yes" : v === false ? "No" : "—";
  if (Array.isArray(v)) return v.length ? v.map(label).join(", ") : "—";
  if (def.data_type === "choice" || def.data_type === "ordered") return label(v);
  return String(v);
}
