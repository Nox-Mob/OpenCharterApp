/**
 * Member standing (E-13a, D-056, D-111). Derived on read from the membership and the org's
 * grace period, never stored. Mirrors public.membership_standing / public.renewal_start
 * (db/tests/95_memberships.sql checks the SQL side against the same cases).
 * Dates are calendar dates (YYYY-MM-DD) with no time zone.
 */
export type MembershipStatus = "pending" | "active" | "cancelled" | "declined";
export type Standing = "good" | "grace" | "lapsed" | "pending" | "cancelled" | "declined" | "none";

export type MembershipState = {
  status: MembershipStatus;
  paid_through: string | null;
  lifetime: boolean;
};

export const STANDING_LABELS: Record<Standing, string> = {
  good: "Good standing",
  grace: "In grace period",
  lapsed: "Lapsed",
  pending: "Awaiting approval",
  cancelled: "Cancelled",
  declined: "Declined",
  none: "Not a member",
};

const day = 24 * 60 * 60 * 1000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const addDays = (d: string, n: number) =>
  new Date(toUtc(d) + n * day).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) =>
  Math.round((toUtc(to) - toUtc(from)) / day);
/** Today's calendar date where the browser is. */
export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export function standing(m: MembershipState | null, graceDays: number, on: string): Standing {
  if (!m) return "none";
  if (m.status !== "active") return m.status;
  if (m.lifetime) return "good";
  if (!m.paid_through) return "lapsed";
  if (on <= m.paid_through) return "good";
  if (on <= addDays(m.paid_through, graceDays)) return "grace";
  return "lapsed";
}

/** Good standing for officer, voting and benefit checks (D-056): good or in grace. */
export const inGoodStanding = (s: Standing) => s === "good" || s === "grace";

/** Days left until paid_through (negative once past it). Null for lifetime or no membership. */
export function daysToExpiration(m: MembershipState | null, on: string): number | null {
  if (!m || m.status !== "active" || m.lifetime || !m.paid_through) return null;
  return daysBetween(on, m.paid_through);
}

/** "Lifetime", "Expires in 12 days", "Expires today", "Expired 3 days ago". */
export function expirationLabel(m: MembershipState | null, on: string): string {
  if (m?.status === "active" && m.lifetime) return "Lifetime";
  const d = daysToExpiration(m, on);
  if (d === null) return "—";
  if (d === 0) return "Expires today";
  if (d > 0) return `Expires in ${d} day${d === 1 ? "" : "s"}`;
  return `Expired ${-d} day${d === -1 ? "" : "s"} ago`;
}

/**
 * Where the next term starts (D-133): the day after paid_through while in good standing or
 * grace, so renewing early never loses paid days; otherwise the reference day.
 */
export function renewalStart(m: MembershipState | null, graceDays: number, on: string): string {
  const s = standing(m, graceDays, on);
  if (m && !m.lifetime && m.paid_through && (s === "good" || s === "grace"))
    return addDays(m.paid_through, 1);
  return on;
}
