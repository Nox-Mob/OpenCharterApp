import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { db } from "@/lib/db/pending-schema";
import type { OrgType } from "@/lib/policy";
import { inviteUrl } from "@/modules/invitations";

/**
 * Chapter creation wizard (E-16, D-144). A national or region creates a chapter in steps:
 * basics, the chapter fields it defines (D-061), a first admin, and officers for the seats it
 * requires (D-141). Officers can't be appointed before they're members, so the wizard invites
 * them; the seats show as Vacant on the new chapter's Board tab until someone is appointed.
 * Everything goes through the existing RPCs (create_organization, set_attribute_value,
 * create_invitation).
 */
export type WizardStep = "basics" | "details" | "admin" | "officers" | "done";

export function wizardSteps(opts: {
  isChild: boolean;
  type: OrgType;
  hasFields: boolean;
  requiredSeats: number;
}): WizardStep[] {
  if (!opts.isChild) return ["basics", "done"];
  const steps: WizardStep[] = ["basics"];
  if (opts.type === "chapter" && opts.hasFields) steps.push("details");
  steps.push("admin");
  if (opts.type === "chapter" && opts.requiredSeats > 0) steps.push("officers");
  steps.push("done");
  return steps;
}

export const STEP_TITLES: Record<WizardStep, string> = {
  basics: "Name and type",
  details: "Chapter details",
  admin: "Chapter admin",
  officers: "Required officers",
  done: "Done",
};

export type RequiredSeat = { id: string; key: string; title: string; seat_count: number };

/** Required seats the parent (or its ancestors) defines for every chapter below it. */
export const requiredChapterSeatsQuery = (lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["required-chapter-seats", ...lineage],
    queryFn: async (): Promise<RequiredSeat[]> => {
      const { data, error } = await db
        .from("seat_templates")
        .select("id,key,title,seat_count,sort_order")
        .in("org_id", [...lineage])
        .eq("scope", "chapters")
        .eq("required", true)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(({ sort_order: _s, ...r }) => r);
    },
  });

const email = z.string().trim().toLowerCase().email("Enter a valid email");
const optionalEmail = z.union([z.literal(""), email]);

export const wizardInvitesSchema = z.object({
  admin: optionalEmail,
  /** seat id → email ("" = invite later) */
  officers: z.record(z.string(), optionalEmail),
});
export type WizardInvites = z.infer<typeof wizardInvitesSchema>;

export type PlannedInvite = { email: string; role: "org_admin" | "member"; forSeats: string[] };

/**
 * The invitations to send after the chapter exists: one per distinct email. The admin gets the
 * admin role; officers join as members and are appointed on the Board tab once they've joined.
 */
export function plannedInvites(
  invites: WizardInvites,
  seats: readonly Pick<RequiredSeat, "id" | "title">[],
): PlannedInvite[] {
  const byEmail = new Map<string, PlannedInvite>();
  const admin = invites.admin.trim().toLowerCase();
  if (admin) byEmail.set(admin, { email: admin, role: "org_admin", forSeats: [] });
  for (const s of seats) {
    const e = (invites.officers[s.id] ?? "").trim().toLowerCase();
    if (!e) continue;
    const existing = byEmail.get(e);
    if (existing) existing.forSeats.push(s.title);
    else byEmail.set(e, { email: e, role: "member", forSeats: [s.title] });
  }
  return [...byEmail.values()];
}

export type SentInvite = PlannedInvite & { link: string | null };

/** Sends the invitations; a failure on one doesn't stop the others. */
export async function sendInvites(
  orgId: string,
  planned: readonly PlannedInvite[],
  origin: string,
): Promise<SentInvite[]> {
  const out: SentInvite[] = [];
  for (const p of planned) {
    const { data, error } = await db.rpc("create_invitation", {
      _org: orgId,
      _email: p.email,
      _role_key: p.role,
    });
    out.push({ ...p, link: error ? null : inviteUrl(origin, data as string) });
  }
  return out;
}
