import { supabase } from "@/integrations/supabase/client";

/**
 * Where a signed-in person lands (D-206): their default organization if they set one and still
 * belong to it, otherwise their only organization, otherwise the list of their organizations.
 * The default is kept in the sign-in account's metadata (`default_org_id`), so it follows the
 * person and needs no table.
 */
export function landingOrgId(
  orgs: readonly { id: string }[],
  defaultOrgId: string | null,
): string | null {
  if (defaultOrgId && orgs.some((o) => o.id === defaultOrgId)) return defaultOrgId;
  return orgs.length === 1 ? orgs[0]!.id : null;
}

/** The default organization stored on the account, if any. */
export function defaultOrgIdOf(user: { user_metadata?: unknown } | null | undefined) {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const id = meta["default_org_id"];
  return typeof id === "string" && id ? id : null;
}

/** Set (or clear, with null) the organization opened after signing in. */
export async function saveDefaultOrg(orgId: string | null) {
  const { error } = await supabase.auth.updateUser({ data: { default_org_id: orgId } });
  if (error) throw error;
}
