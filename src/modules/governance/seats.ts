import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { db } from "@/lib/db/pending-schema";
import { termEndDate, type TermUnit } from "@/modules/membership/tiers";

/**
 * Board seats and appointments (E-17, D-141, D-142). Reads come from public.org_board /
 * board_history and RLS; every write goes through a definer RPC (define_seat, update_seat,
 * set_seat_active, set_seat_title, set_seat_term, recalculate_planned_ends, appoint_officer,
 * end_appointment), so seat counts, good standing, no escalation and history hold in one place.
 */
export type SeatScope = "self" | "chapters";
export type SeatTerm = { count: number; unit: TermUnit } | null;

export type Holder = {
  appointment_id: string;
  profile_id: string;
  display_name: string;
  seat_number: number;
  starts_on: string;
  planned_end: string | null;
};

export type Seat = {
  template_id: string;
  owner_org_id: string;
  key: string;
  title: string;
  default_title: string;
  description: string;
  required: boolean;
  seat_count: number;
  scope: SeatScope;
  role_id: string | null;
  term: SeatTerm;
  term_source: "org" | "default";
  term_since: string | null;
  bylaw_reference: string;
  holders: Holder[];
};

export type PastAppointment = {
  appointment_id: string;
  template_id: string;
  display_name: string;
  seat_number: number;
  starts_on: string;
  planned_end: string | null;
  ended_on: string;
  end_reason: string;
};

export type TermRule = {
  id: string;
  template_id: string;
  term: SeatTerm;
  effective_from: string;
  bylaw_reference: string;
  note: string;
  created_at: string;
};

export type SeatTemplate = {
  id: string;
  org_id: string;
  key: string;
  title: string;
  description: string;
  required: boolean;
  seat_count: number;
  default_term: SeatTerm;
  role_id: string | null;
  scope: SeatScope;
  sort_order: number;
  active: boolean;
};

const term = (count: number | null, unit: TermUnit | null): SeatTerm =>
  count === null || unit === null ? null : { count, unit };

export const boardQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["board", orgId],
    queryFn: async (): Promise<Seat[]> => {
      const { data, error } = await db.rpc("org_board", { _org: orgId });
      if (error) throw error;
      return (data ?? []).map(({ term_count, term_unit, holders, term_source, scope, ...s }) => ({
        ...s,
        scope: scope as SeatScope,
        term_source: term_source === "org" ? "org" : "default",
        term: term(term_count, term_unit),
        holders: (holders ?? []) as unknown as Holder[],
      }));
    },
  });

export const boardHistoryQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["board-history", orgId],
    queryFn: async (): Promise<PastAppointment[]> => {
      const { data, error } = await db.rpc("board_history", { _org: orgId });
      if (error) throw error;
      return data ?? [];
    },
  });

/** The org's own term rules, newest first: the by-law history of each seat (D-142). */
export const termRulesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["seat-terms", orgId],
    queryFn: async (): Promise<TermRule[]> => {
      const { data, error } = await db
        .from("seat_terms")
        .select(
          "id,template_id,length_count,length_unit,effective_from,bylaw_reference,note,created_at",
        )
        .eq("org_id", orgId)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(({ length_count, length_unit, ...r }) => ({
        ...r,
        term: term(length_count, length_unit),
      }));
    },
  });

/** Seats this org defined itself (including retired ones), for the seat editor. */
export const ownSeatsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["seat-templates", orgId],
    queryFn: async (): Promise<SeatTemplate[]> => {
      const { data, error } = await db
        .from("seat_templates")
        .select(
          "id,org_id,key,title,description,required,seat_count,default_term_count,default_term_unit,role_id,scope,sort_order,active",
        )
        .eq("org_id", orgId)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return (data ?? []).map(({ default_term_count, default_term_unit, ...t }) => ({
        ...t,
        default_term: term(default_term_count, default_term_unit),
      }));
    },
  });

// ----- pure helpers -----

const UNIT: Record<TermUnit, [string, string]> = {
  day: ["day", "days"],
  month: ["month", "months"],
  year: ["year", "years"],
};

export function seatTermLabel(t: SeatTerm): string {
  if (!t) return "No fixed term";
  const [one, many] = UNIT[t.unit];
  return `${t.count} ${t.count === 1 ? one : many}`;
}

/** "Term: 2 years (Bylaws Art. IV §2, since 2026-03-01)". */
export function termSummary(
  s: Pick<Seat, "term" | "term_source" | "term_since" | "bylaw_reference">,
) {
  const base = `Term: ${seatTermLabel(s.term)}`;
  if (s.term_source === "default") return `${base} (suggested default)`;
  const parts = [s.bylaw_reference, s.term_since ? `since ${s.term_since}` : ""].filter(Boolean);
  return parts.length ? `${base} (${parts.join(", ")})` : base;
}

export function openSeats(s: Pick<Seat, "seat_count" | "holders">): number {
  return Math.max(0, s.seat_count - s.holders.length);
}

/** Required seats with nobody in them. */
export function vacantRequired(seats: readonly Seat[]): Seat[] {
  return seats.filter((s) => s.required && s.holders.length === 0);
}

/** Mirror of public.seat_planned_end: the last day of a term starting on `start`. */
export function plannedEnd(start: string, t: SeatTerm): string | null {
  return termEndDate(start, t);
}

/** The rule in force on a day: the latest one effective by then (rules are newest first). */
export function ruleInForce(rules: readonly TermRule[], templateId: string, on: string) {
  return rules.find((r) => r.template_id === templateId && r.effective_from <= on) ?? null;
}

export function seatKey(title: string): string {
  const k = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(k) ? k : `seat_${k}`.slice(0, 40);
}

// ----- writes -----

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const termShape = z
  .object({ count: z.number().int().min(1).max(100), unit: z.enum(["day", "month", "year"]) })
  .nullable();

export const seatInputSchema = z.object({
  title: z.string().trim().min(1, "Give the seat a title").max(80),
  description: z.string().trim().max(500),
  required: z.boolean(),
  seat_count: z.number().int().min(1, "At least one seat").max(50),
  term: termShape,
  role_id: z.string().uuid().nullable(),
  scope: z.enum(["self", "chapters"]),
  sort_order: z.number().int(),
});
export type SeatInput = z.infer<typeof seatInputSchema>;

export const termInputSchema = z.object({
  term: termShape,
  effective_from: isoDate,
  bylaw_reference: z.string().trim().max(200),
  note: z.string().trim().max(500),
});
export type TermInput = z.infer<typeof termInputSchema>;

/**
 * SQL null for an argument the generated types mark as required. update_seat and set_seat_term
 * take no defaults for these, so they must always be sent (an omitted argument makes PostgREST
 * look for a function with fewer parameters and fail).
 */
const sqlNull = <T>(v: T | null): T => v as T;
const termArgs = (t: SeatTerm) => (t ? { _term_count: t.count, _term_unit: t.unit } : {});

export async function defineSeat(orgId: string, input: SeatInput) {
  const v = seatInputSchema.parse(input);
  const { data, error } = await db.rpc("define_seat", {
    _org: orgId,
    _key: seatKey(v.title),
    _title: v.title,
    _description: v.description,
    _required: v.required,
    _seat_count: v.seat_count,
    ...termArgs(v.term),
    ...(v.role_id ? { _role: v.role_id } : {}),
    _scope: v.scope,
    _sort_order: v.sort_order,
  });
  if (error) throw error;
  return data as string;
}

export async function updateSeat(templateId: string, input: SeatInput) {
  const v = seatInputSchema.parse(input);
  const { error } = await db.rpc("update_seat", {
    _template: templateId,
    _title: v.title,
    _description: v.description,
    _required: v.required,
    _seat_count: v.seat_count,
    _term_count: sqlNull(v.term?.count ?? null),
    _term_unit: sqlNull(v.term?.unit ?? null),
    _role: sqlNull(v.role_id),
    _sort_order: v.sort_order,
  });
  if (error) throw error;
}

export async function setSeatActive(templateId: string, active: boolean) {
  const { error } = await db.rpc("set_seat_active", { _template: templateId, _active: active });
  if (error) throw error;
}

export async function setSeatTitle(orgId: string, templateId: string, title: string) {
  const { error } = await db.rpc("set_seat_title", {
    _org: orgId,
    _template: templateId,
    _title: title,
  });
  if (error) throw error;
}

export async function setSeatTerm(orgId: string, templateId: string, input: TermInput) {
  const v = termInputSchema.parse(input);
  const { error } = await db.rpc("set_seat_term", {
    _org: orgId,
    _template: templateId,
    _count: sqlNull(v.term?.count ?? null),
    _unit: sqlNull(v.term?.unit ?? null),
    _effective_from: v.effective_from,
    _bylaw_reference: v.bylaw_reference,
    _note: v.note,
  });
  if (error) throw error;
}

export async function applyTermToCurrentOfficers(orgId: string, templateId: string) {
  const { data, error } = await db.rpc("recalculate_planned_ends", {
    _org: orgId,
    _template: templateId,
  });
  if (error) throw error;
  return data ?? 0;
}

export async function appointOfficer(
  orgId: string,
  templateId: string,
  profileId: string,
  startsOn: string,
) {
  const { data, error } = await db.rpc("appoint_officer", {
    _org: orgId,
    _template: templateId,
    _profile: profileId,
    _starts_on: isoDate.parse(startsOn),
  });
  if (error) throw error;
  return data as string;
}

export async function endAppointment(appointmentId: string, reason: string, endedOn: string) {
  const { error } = await db.rpc("end_appointment", {
    _appointment: appointmentId,
    _reason: reason,
    _ended_on: isoDate.parse(endedOn),
  });
  if (error) throw error;
}

/** Friendly text for errors raised by the board RPCs. */
export function boardErrorMessage(message: string): string {
  const known: [string, string][] = [
    ["good standing", "Officers must be members in good standing"],
    ["all seats are filled", "Every seat is filled. End a current term first"],
    ["already holds", "This person already holds that seat"],
    ["not a member", "Only members of this organization can be appointed"],
    ["permissions you hold", "This seat grants access you don't have, so you can't appoint to it"],
    ["parent organization manages board seats", "Your parent organization manages board seats"],
    ["sets the seat titles", "Your parent organization sets the seat titles"],
    ["only a national or region", "Only a national or region can define seats for its chapters"],
    ["already exists", "A seat with that title already exists"],
    ["number and a unit", "Give the term as a number and a unit, or no fixed term"],
    ["end the current appointments", "End the current terms before retiring this seat"],
    ["seats you're removing", "End the terms in the seats you're removing first"],
    ["already ended", "This term has already ended"],
    ["before the start", "The end can't be before the start"],
    ["keep at least one admin", "An organization must keep at least one admin"],
    ["role is retired", "The seat's role is retired"],
    ["isn't used here", "That seat isn't used here"],
  ];
  return known.find(([k]) => message.includes(k))?.[1] ?? "Couldn't save the change";
}
