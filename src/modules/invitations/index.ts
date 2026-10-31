import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  // Any role key: built-in or org-defined (E-05). The database resolves and checks it.
  role: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Pick a role"),
});

export type InviteRow = {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
};
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export function inviteStatus(inv: InviteRow, now: Date = new Date()): InviteStatus {
  if (inv.accepted_at) return "accepted";
  if (inv.revoked_at) return "revoked";
  if (new Date(inv.expires_at) <= now) return "expired";
  return "pending";
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

/** Only allow same-origin relative redirects after sign-in. */
export function safeRedirect(target: string | undefined, fallback = "/dashboard"): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\"))
    return fallback;
  return target;
}
